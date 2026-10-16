import assert from "node:assert/strict";
import test from "node:test";
import { Narrator, prepareScript, chooseCue } from "../narration.js";
import { preferredVoice, isMaleVoice } from "../voice-profile.js";

class Utterance { constructor(text) { this.text = text; } }
function setup() {
  const utterances = [], states = [], sentences = [], boundaries = [];
  let silences = 0;
  const synth = { cancel() {}, getVoices: () => [], speak: (utterance) => utterances.push(utterance) };
  const narrator = new Narrator({ synth, Utterance, onState: (state) => states.push(state), onSentence: (value) => sentences.push(value), onBoundary: (value) => boundaries.push(value), onSilence: () => silences++ });
  return { narrator, utterances, states, sentences, boundaries, synth, silenceCount: () => silences };
}

test("script segmentation keeps text and maps sentences to meaningful gestures", () => {
  const parts = prepareScript("Selamat datang. Ada tiga hal penting. Perhatikan bagian ini! Saya akan menjelaskan sistem.");
  assert.deepEqual(parts.map((part) => part.cue.gesture), ["welcome", "count", "pointRight", "explain"]);
  assert.equal(parts[1].cue.count, 3);
  assert.equal(chooseCue("Bagian kedua").count, 2);
  assert.equal(chooseCue("Saya sedih").mood, "sad");
  const text = "penjelasan ".repeat(70).trim();
  const chunks = prepareScript(text);
  assert(chunks.every((part) => part.text.length <= 220));
  assert.equal(chunks.map((part) => part.text).join(" "), text);
  assert.throws(() => prepareScript("  "));
  assert.throws(() => prepareScript("a".repeat(5001)));
});

test("sentences speak sequentially and animation starts only when audio starts", async () => {
  const s = setup();
  const voice = { lang: "id-ID", voiceURI: "indonesia" };
  s.narrator.play("Halo. Ada dua hal.", { voice, rate: 0.8 });
  assert.equal(s.utterances.length, 1);
  assert.equal(s.sentences.length, 0);
  const first = s.utterances[0];
  assert.equal(first.voice, voice);
  assert.equal(first.rate, 0.8);
  first.onstart();
  assert.equal(s.sentences[0].cue.gesture, "welcome");
  first.onboundary({ charIndex: 0, charLength: 4, name: "word", elapsedTime: 0 });
  assert.equal(s.boundaries[0].text, "Halo.");
  first.onend();
  await Promise.resolve();
  assert.equal(s.utterances.length, 2);
  s.utterances[1].onstart();
  assert.equal(s.sentences[1].cue.count, 2);
  s.utterances[1].onend();
  await Promise.resolve();
  assert.equal(s.narrator.state, "complete");
  assert(s.silenceCount() >= 2);
});

test("Stop cancels the queued continuation and ignores late browser events", async () => {
  const s = setup();
  s.narrator.play("Satu. Dua.");
  const old = s.utterances[0];
  old.onstart();
  old.onend();
  s.narrator.stop();
  await Promise.resolve();
  old.onstart();
  old.onboundary({ charIndex: 0 });
  old.onerror({ error: "canceled" });
  assert.equal(s.utterances.length, 1);
  assert.equal(s.narrator.state, "idle");
  assert.equal(s.boundaries.length, 0);
});

test("restarting cannot let an old utterance end or cancel the new speech", () => {
  const s = setup();
  s.narrator.play("Lama.");
  const old = s.utterances[0];
  s.narrator.play("Baru.");
  s.utterances[1].onstart();
  old.onend(); old.onerror({ error: "interrupted" });
  assert.equal(s.narrator.state, "speaking");
  assert.equal(s.narrator.current.text, "Baru.");
  s.narrator.stop();
});

test("voice errors stop facial speech and clear pending sentences", async () => {
  const s = setup();
  s.narrator.play("Halo. Lanjut.");
  s.utterances[0].onstart();
  s.utterances[0].onerror({ error: "voice-unavailable" });
  await Promise.resolve();
  assert.equal(s.narrator.state, "error");
  assert.equal(s.narrator.current, null);
  assert.equal(s.utterances.length, 1);
  assert(s.silenceCount() >= 2);
});

test("unsupported engines and empty text do not start speech", () => {
  const unsupported = new Narrator({ synth: null, Utterance: null });
  assert.equal(unsupported.supported, false);
  assert.throws(() => unsupported.play("Halo"));
  const s = setup();
  assert.throws(() => s.narrator.play("\n "));
  assert.equal(s.utterances.length, 0);
});

test("automatic voice prefers Indonesian male without switching to a foreign language", () => {
  const google = { name: "Google Bahasa Indonesia", lang: "id-ID" };
  const female = { name: "Indonesian Female Natural", lang: "id-ID", default: true };
  const male = { name: "Microsoft Ardi Online (Natural) - Indonesian", lang: "id-ID" };
  const english = { name: "English Male Natural", lang: "en-US", default: true };
  assert.equal(isMaleVoice(female), false);
  assert.equal(isMaleVoice(google), false);
  assert.equal(preferredVoice([english, female, google, male]), male);
  assert.equal(preferredVoice([english, google]), google);
  assert.equal(preferredVoice([english]), null);
  assert.equal(preferredVoice([]), null);
});

test("narration uses the male preference and restrained delivery while honoring a manual voice", async () => {
  const s = setup();
  const male = { name: "id-ID-ArdiNeural", lang: "id-ID" };
  const other = { name: "Google Bahasa Indonesia", lang: "id-ID" };
  s.synth.getVoices = () => [other, male];
  try {
    s.narrator.play("Selamat datang! Saya akan menjelaskan sistem.");
    const welcome = s.utterances[0];
    assert.equal(welcome.voice, male);
    assert.equal(welcome.volume, 1);
    assert(welcome.pitch >= 0.9 && welcome.pitch < 1);
    assert(welcome.rate > 0.95 && welcome.rate < 1);
    welcome.onstart(); welcome.onend();
    await Promise.resolve();
    const explanation = s.utterances[1];
    assert.equal(explanation.voice, male);
    assert(explanation.pitch < welcome.pitch);
    assert.equal(explanation.rate, 0.95);
    s.narrator.play("Saya akan menjelaskan sistem.", { voice: other, rate: 1.1 });
    const manual = s.utterances[2];
    assert.equal(manual.voice, other);
    assert.equal(manual.rate, 1.1);
    assert(manual.pitch >= 0.8 && manual.pitch < 1);
  } finally { s.narrator.stop(); }
});
