import { DEFAULT_SPEECH_RATE, preferredVoice, speechDelivery } from "./voice-profile.js";

import { prepareScript } from "./speech-plan.js";
export { prepareScript, chooseCue } from "./speech-plan.js";

export class Narrator {
  constructor({ synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance, onState = () => {}, onSentence = () => {}, onBoundary = () => {}, onSilence = () => {} } = {}) {
    Object.assign(this, { synth, Utterance, onState, onSentence, onBoundary, onSilence });
    this.generation = 0;
    this.current = null;
    this.watchdog = null;
    this.state = "idle";
  }
  get supported() { return Boolean(this.synth && this.Utterance); }
  get voices() { return this.supported ? this.synth.getVoices() : []; }
  emit(state, detail = {}) { this.state = state; this.onState(state, detail); }
  stop(notify = true) {
    this.generation++;
    clearTimeout(this.watchdog);
    this.current = null;
    this.synth?.cancel();
    this.onSilence();
    if (notify) this.emit("idle");
  }
  play(text, { voice = null, rate = DEFAULT_SPEECH_RATE } = {}) {
    if (!this.supported) throw new Error("Browser ini belum mendukung pembacaan teks. Coba Chrome atau Edge.");
    const parts = prepareScript(text);
    this.stop(false);
    const generation = this.generation;
    const options = { voice: voice ?? preferredVoice(this.voices), rate: Math.max(0.6, Math.min(1.3, Number(rate) || DEFAULT_SPEECH_RATE)) };
    this.next(parts, 0, generation, options);
  }
  next(parts, index, generation, options) {
    if (generation !== this.generation) return;
    if (index >= parts.length) { this.emit("complete", { total: parts.length }); return; }
    const part = parts[index];
    const utterance = new this.Utterance(part.text);
    this.current = utterance; // Keep a reference until the browser finishes.
    utterance.lang = options.voice?.lang || "id-ID";
    if (options.voice) utterance.voice = options.voice;
    Object.assign(utterance, speechDelivery(part, options.voice, options.rate));
    const alive = () => generation === this.generation && this.current === utterance;
    const fail = (code) => {
      if (!alive()) return;
      this.stop(false);
      const messages = {
        "not-allowed": "Suara diblokir browser. Tekan Mulai Bicara untuk mencoba lagi.",
        "voice-unavailable": "Suara ini tidak tersedia. Pilih suara lain.",
        "language-unavailable": "Bahasa suara tidak tersedia pada perangkat ini.",
        "network": "Layanan suara tidak terhubung. Periksa koneksi lalu coba lagi.",
        "timeout": "Layanan suara tidak merespons. Pilih suara lain atau coba lagi.",
      };
      this.emit("error", { message: messages[code] || "Suara gagal diputar. Pilih suara lain atau coba lagi.", code });
    };
    utterance.onstart = () => {
      if (!alive()) return;
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => fail("timeout"), 120000);
      this.onSentence({ ...part, index, total: parts.length });
      this.emit("speaking", { index, total: parts.length });
    };
    utterance.onboundary = (event) => {
      if (!alive() || this.state !== "speaking") return;
      this.onBoundary({ text: part.text, charIndex: event.charIndex, charLength: event.charLength, name: event.name, elapsedTime: event.elapsedTime });
    };
    utterance.onend = () => {
      if (!alive()) return;
      clearTimeout(this.watchdog);
      this.current = null;
      this.onSilence();
      queueMicrotask(() => this.next(parts, index + 1, generation, options));
    };
    utterance.onerror = (event) => fail(event.error);
    this.emit("starting", { index, total: parts.length });
    this.watchdog = setTimeout(() => fail("timeout"), 12000);
    try { this.synth.speak(utterance); } catch { fail("synthesis-failed"); }
  }
}
