import { prepareScript, deliveryRate, waitForPause } from "./speech-plan.js";
import { DEFAULT_SPEECH_RATE } from "./voice-profile.js";
import { REST_MOUTH, buildVisemes, analyzeSpeechEnergy, sampleVisemes, audibleTime } from "./lip-sync.js";

export class NeuralNarrator {
  constructor({ fetcher = globalThis.fetch?.bind(globalThis), createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(), wait = waitForPause, onState = () => {}, onSentence = () => {}, onBoundary = () => {}, onSilence = () => {} } = {}) {
    Object.assign(this, { fetcher, createContext, wait, onState, onSentence, onBoundary, onSilence });
    this.generation = 0;
    this.state = "idle";
  }
  get supported() { return Boolean(this.fetcher); }
  emit(state, detail = {}) { this.state = state; this.onState(state, detail); }
  getMouthPose() {
    if (!this.playback || this.context.state === "suspended") return REST_MOUTH;
    const { timeline, energy, started } = this.playback;
    return sampleVisemes(timeline, audibleTime(this.context) - started, energy);
  }
  stop(notify = true) {
    this.generation++;
    this.abort?.abort();
    this.playback = null;
    clearInterval(this.wordTimer);
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
    this.onSilence();
    if (notify) this.emit("idle");
  }
  play(text, { rate = DEFAULT_SPEECH_RATE } = {}) {
    const parts = prepareScript(text);
    this.stop(false);
    const generation = this.generation;
    this.abort = new AbortController();
    this.context ??= this.createContext();
    // Unlock audio during the click, before waiting for the network request.
    const ready = this.context.resume();
    this.emit("starting", { index: 0, total: parts.length });
    this.run(parts, Math.max(0.6, Math.min(1.3, Number(rate) || DEFAULT_SPEECH_RATE)), generation, this.abort.signal, ready)
      .catch((error) => {
        if (generation !== this.generation) return;
        this.stop(false);
        this.emit("error", { message: error.message || "Suara Ardi tidak dapat diputar. Coba lagi." });
      });
  }
  async load(part, rate, signal) {
    const response = await this.fetcher(`${import.meta.env?.BASE_URL ?? "/"}api/tts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: part.text, rate: deliveryRate(part, rate) }), signal,
    });
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Server suara belum aktif. Mulai ulang npm run dev lalu muat ulang halaman.");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Layanan suara Ardi tidak tersedia.");
    if (data.voice !== "id-ID-ArdiNeural" || !data.audio) throw new Error("Respons suara Ardi tidak valid.");
    const bytes = Uint8Array.from(atob(data.audio), (char) => char.charCodeAt(0));
    const buffer = await this.context.decodeAudioData(bytes.buffer);
    let position = 0;
    const words = (data.words ?? []).map((word) => {
      const start = part.text.toLocaleLowerCase("id").indexOf(word.text.toLocaleLowerCase("id"), position);
      if (start >= 0) position = start + word.text.length;
      // Keep spoken words even if TTS expanded a number or abbreviation.
      return { ...word, charIndex: start, charLength: word.text.length };
    });
    return { buffer, words, timeline: buildVisemes(words), energy: analyzeSpeechEnergy(buffer) };
  }
  async run(parts, rate, generation, signal, ready) {
    await ready;
    if (signal.aborted) return;
    // Prefetch one sentence ahead so gestures and speech continue naturally.
    // Attach rejection handling immediately; Stop may cancel this request.
    const load = (part) => this.load(part, rate, signal).then((value) => ({ value }), (error) => ({ error }));
    // Short vowel exercises need every sound ready before starting: otherwise
    // network latency overwhelms the deliberate 400 ms practice pauses.
    let prepared;
    if (parts.length <= 5 && parts.every(part => part.vowel)) {
      prepared = [];
      for (let offset = 0; offset < parts.length; offset += 2) {
        const batch = await Promise.all(parts.slice(offset, offset + 2).map(load));
        if (generation !== this.generation) return;
        const failed = batch.find(result => result.error);
        if (failed) throw failed.error;
        prepared.push(...batch);
      }
    }
    let pending = prepared?.[0] ?? load(parts[0]);
    for (let index = 0; index < parts.length; index++) {
      const result = await pending;
      if (generation !== this.generation) return;
      if (result.error) throw result.error;
      if (index + 1 < parts.length) pending = prepared?.[index + 1] ?? load(parts[index + 1]);
      await this.playBuffer(result.value, parts[index], index, parts.length, signal);
      if (generation !== this.generation) return;
      if (index + 1 < parts.length) {
        this.emit("pausing", { index, total: parts.length });
        await this.wait(parts[index].pauseAfterMs ?? 140, signal);
        if (generation !== this.generation) return;
        this.emit("starting", { index: index + 1, total: parts.length });
      }
    }
    this.emit("complete", { total: parts.length });
  }
  playBuffer({ buffer, words, timeline, energy }, part, index, total, signal) {
    return new Promise((resolve, reject) => {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      this.source = source;
      let wordIndex = 0;
      const started = this.context.currentTime;
      const cleanup = () => {
        clearInterval(this.wordTimer);
        signal.removeEventListener("abort", cancel);
        source.onended = null;
        source.disconnect();
        if (this.source === source) this.source = null;
        this.playback = null;
      };
      const cancel = () => { source.stop(); cleanup(); resolve(); };
      signal.addEventListener("abort", cancel, { once: true });
      source.onended = () => { cleanup(); this.onSilence(); resolve(); };
      try {
        source.start(started);
        this.playback = { started, timeline, energy };
        this.onSentence({ ...part, index, total });
        this.emit("speaking", { index, total });
        this.wordTimer = setInterval(() => {
          const elapsed = audibleTime(this.context) - started;
          while (wordIndex < words.length && words[wordIndex].time <= elapsed) {
            const word = words[wordIndex++];
            if (word.charIndex < 0) continue;
            this.onBoundary({ text: part.text, charIndex: word.charIndex, charLength: word.charLength, name: "word", elapsedTime: word.time });
          }
        }, 25);
      } catch (error) { cleanup(); reject(error); }
    });
  }
}

