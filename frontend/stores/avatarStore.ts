'use client';
import { create } from 'zustand';
import type { PerformanceJob, PerformanceTimeline, PlayerState, SpeechStyle } from '../types/performance';
import type { CharacterId } from '../characters';
import type { ExpressionId } from '../expressions';

let audio: HTMLAudioElement | null = null;
let operation = 0;
let transportOperation = 0;
let jobId: string | null = null;
let controller: AbortController | null = null;
export const getAudio = () => audio;
const initialText = 'Selamat datang di Kampung Kecil.\n\nHari ini kita akan mempelajari dasar-dasar kecerdasan buatan. Ada tiga hal penting yang perlu kita pahami.\n\nPertama, kecerdasan buatan belajar dari data. Kedua, teknologi ini membantu kita menyelesaikan masalah. Ketiga, kita harus menggunakannya dengan bijak.\n\nBagaimana kita bisa mulai belajar? Mari kita pelajari bersama!';

function releaseAudio() { transportOperation++; if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; } }
function cancelGeneration() {
  operation++; controller?.abort(); controller = null;
  if (jobId) { void fetch(`/api/performance/${jobId}`, { method: 'DELETE' }).catch(() => {}); jobId = null; }
}
async function readJson<T>(response: Response): Promise<T> {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Backend belum tersambung. Jalankan npm run dev lalu coba lagi.');
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Permintaan gagal. Periksa naskah dan sambungan backend.');
  return data;
}
function delay(signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, 450);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}
function loadAudio(element: HTMLAudioElement, url: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); element.removeEventListener('canplay', ready); element.removeEventListener('error', error); signal.removeEventListener('abort', cancel); };
    const ready = () => { cleanup(); resolve(); };
    const error = () => { cleanup(); reject(new Error('Audio gagal dimuat. Buat ulang performa atau coba lagi.')); };
    const cancel = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(error, 30000);
    element.addEventListener('canplay', ready, { once: true }); element.addEventListener('error', error, { once: true });
    signal.addEventListener('abort', cancel, { once: true });
    element.preload = 'auto'; element.src = url; element.load();
    if (signal.aborted) cancel();
  });
}

interface AvatarState {
  speechStyle: SpeechStyle; setSpeechStyle(style: SpeechStyle): void;
  expression: ExpressionId; expressionIntensity: number;
  setExpression(expression: ExpressionId): void; setExpressionIntensity(intensity: number): void;
  character: CharacterId; setCharacter(character: CharacterId): void;
  text: string; rate: number; state: PlayerState; stage: string; error: string | null;
  timeline: PerformanceTimeline | null; currentTime: number; duration: number; modelReady: boolean;
  modelError: string | null; focusFace: boolean; audioUrl: string | null; timelineUrl: string | null;
  setText(text: string): void; setRate(rate: number): void; setModelReady(ready: boolean): void;
  setModelError(error: string | null): void; setFocusFace(focus: boolean): void;
  generate(): Promise<void>; play(): Promise<void>; pause(): void; stop(): void; cancel(): void; seek(time: number): void;
}

export const useAvatarStore = create<AvatarState>((set, get) => ({
  speechStyle: 'conversational',
  setSpeechStyle(speechStyle) {
    if (get().speechStyle === speechStyle) return;
    get().setText(get().text);
    set({ speechStyle, rate: speechStyle === 'relaxed' ? .85 : .95,
      stage: 'Gaya bicara berubah. Buat performa untuk mendengar hasilnya.' });
  },
  expression: 'auto', expressionIntensity: .8,
  setExpression(expression) { set({ expression }); },
  setExpressionIntensity(intensity) { if (Number.isFinite(intensity)) set({ expressionIntensity: Math.max(0, Math.min(1, intensity)) }); },
  character: 'harry',
  setCharacter(character) {
    if (character === get().character) return;
    get().stop();
    set({ character, modelReady: false, modelError: null });
  },
  text: initialText, rate: .95, state: 'idle', stage: 'Tulis naskah, lalu buat performa.', error: null,
  timeline: null, currentTime: 0, duration: 0, modelReady: false, modelError: null, focusFace: false, audioUrl: null, timelineUrl: null,
  setText(text) { get().cancel(); releaseAudio(); set({ text, timeline: null, state: 'idle', currentTime: 0, duration: 0, audioUrl: null, timelineUrl: null, stage: 'Naskah berubah. Buat performa untuk mendengar hasilnya.', error: null }); },
  setRate(rate) { get().setText(get().text); set({ rate }); },
  setModelReady(modelReady) { set({ modelReady, modelError: null }); },
  setModelError(modelError) { get().stop(); set({ modelError, modelReady: false }); },
  setFocusFace(focusFace) { set({ focusFace }); },
  cancel() {
    cancelGeneration();
    if (get().state === 'generating') set({ state: 'idle', stage: 'Pembuatan dibatalkan.' });
  },
  async generate() {
    get().cancel(); releaseAudio();
    const token = operation, abort = new AbortController(); controller = abort;
    const { text, rate, speechStyle } = get();
    if (!text.trim()) { set({ state: 'error', error: 'Tulis naskah terlebih dahulu.' }); return; }
    set({ state: 'generating', stage: 'Menganalisis naskah…', error: null, timeline: null, currentTime: 0, duration: 0, audioUrl: null, timelineUrl: null });
    try {
      // Keep the short creation request alive so cancellation can still obtain
      // its job id and cancel the server task rather than orphaning it.
      let job = await readJson<PerformanceJob>(await fetch('/api/performance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language: 'id-ID', voice: 'default', rate, speech_style: speechStyle }) }));
      if (token !== operation) { void fetch(job.status_url, { method: 'DELETE' }).catch(() => {}); return; }
      jobId = job.id;
      const deadline = Date.now() + 240000;
      while (job.status === 'generating') {
        if (Date.now() > deadline) throw new Error('Pembuatan terlalu lama. Coba naskah yang lebih pendek.');
        set({ stage: `${job.stage}…` });
        await delay(abort.signal);
        if (token !== operation) return;
        job = await readJson<PerformanceJob>(await fetch(job.status_url, { signal: abort.signal, cache: 'no-store' }));
      }
      if (job.status !== 'ready') throw new Error(job.error || 'Pembuatan dibatalkan.');
      set({ stage: 'Memuat audio dan animasi…' });
      const timeline = await readJson<PerformanceTimeline>(await fetch(job.timeline_url, { signal: abort.signal }));
      if (timeline.version !== 1 || !Array.isArray(timeline.visemes) || !Array.isArray(timeline.gestures)) throw new Error('Format timeline tidak didukung.');
      const element = new Audio(); audio = element;
      await loadAudio(element, job.audio_url, abort.signal);
      if (token !== operation) return;
      element.ontimeupdate = () => { if (audio === element) set({ currentTime: element.currentTime }); };
      element.onended = () => { if (audio === element && element.ended) set({ state: 'finished', currentTime: element.duration, stage: 'Performa selesai.' }); };
      element.onerror = () => { if (audio === element) set({ state: 'error', error: 'Pemutaran audio gagal. Buat ulang performa.' }); };
      element.onpause = () => { if (audio === element && element.paused && get().state === 'playing' && !element.ended) set({ state: 'paused', stage: 'Pemutaran dijeda.' }); };
      jobId = null;
      set({ timeline, duration: element.duration, state: 'ready', stage: 'Performa siap. Tekan Play untuk mulai.', audioUrl: job.audio_url, timelineUrl: job.timeline_url });
    } catch (error) {
      if (token !== operation) return;
      cancelGeneration(); releaseAudio();
      set({ state: 'error', stage: 'Gagal membuat performa.', error: error instanceof Error ? error.message : 'Performa gagal dibuat.' });
    }
  },
  async play() {
    const element = audio;
    if (!element || !get().timeline || !get().modelReady) return;
    const token = ++transportOperation;
    if (get().state === 'finished') element.currentTime = 0;
    try { await element.play(); if (audio === element && token === transportOperation) set({ state: 'playing', error: null, stage: 'Memutar performa…' }); }
    catch { if (audio === element && token === transportOperation) set({ state: 'error', error: 'Audio belum dapat diputar. Tekan Play untuk mencoba lagi.' }); }
  },
  pause() { transportOperation++; audio?.pause(); if (get().timeline) set({ state: 'paused', stage: 'Pemutaran dijeda.' }); },
  stop() {
    transportOperation++;
    if (get().state === 'generating') { get().cancel(); return; }
    audio?.pause(); if (audio) audio.currentTime = 0;
    set({ state: get().timeline ? 'ready' : 'idle', currentTime: 0, stage: 'Pemutaran dihentikan.' });
  },
  seek(time) { if (audio && get().timeline) { audio.currentTime = Math.max(0, Math.min(get().duration, time)); set({ currentTime: audio.currentTime, ...(get().state === 'finished' ? { state: 'paused' as const } : {}) }); } },
}));
