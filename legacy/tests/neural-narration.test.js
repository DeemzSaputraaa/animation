import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { NeuralNarrator } from "../neural-narration.js";

const response = (data = {}) => ({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ voice: "id-ID-ArdiNeural", audio: "AQID", words: [{ text: "Halo", time: 0, duration: 0.5 }], ...data }) });
function setup(t, fetcher = async () => response()) {
  const sources = [], sentences = [], boundaries = [];
  let silence = 0;
  const context = {
    currentTime: 0, destination: {}, resume: async () => {}, decodeAudioData: async () => ({ duration: 2, sampleRate: 1000, getChannelData: () => new Float32Array(2000).fill(0.1) }),
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } };
      sources.push(source); return source;
    },
  };
  const narrator = new NeuralNarrator({ createContext: () => context, fetcher, wait: async () => {}, onSentence: (part) => sentences.push(part), onBoundary: (word) => boundaries.push(word), onSilence: () => silence++ });
  t.after(() => narrator.stop());
  return { narrator, context, sources, sentences, boundaries, silence: () => silence };
}

test("Ardi audio starts animations at playback and reads sentences sequentially", async (t) => {
  const requests = [];
  const s = setup(t, async (url, options) => { requests.push(JSON.parse(options.body)); return response(); });
  s.narrator.play("Halo. Ada tiga hal.");
  assert.equal(s.sentences.length, 0);
  await setImmediate();
  assert.equal(s.narrator.state, "speaking");
  assert.equal(s.sources.length, 1);
  assert.equal(requests.length, 2, "next sentence is prefetched");
  assert.equal(requests[0].rate, 0.95);
  assert.equal(s.sentences[0].cue.gesture, "welcome");
  s.context.currentTime = 0.18;
  const vowel = s.narrator.getMouthPose();
  assert(vowel.open > 0.5, "Mouth must sample the vowel in Halo from playback time");
  s.context.currentTime = 0.7;
  assert.equal(s.narrator.getMouthPose().open, 0, "Word timing gaps must close the mouth");
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(s.boundaries[0].charIndex, 0);
  s.sources[0].onended();
  await setImmediate();
  assert.equal(s.sentences[1].cue.count, 3);
  s.sources[1].onended();
  await setImmediate();
  assert.equal(s.narrator.state, "complete");
  assert.equal(s.narrator.getMouthPose().open, 0);
  assert(s.silence() >= 3);
});

test("Stop while downloading cancels the request and never starts late audio", async (t) => {
  let finish, signal;
  const s = setup(t, (_, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); });
  s.narrator.play("Halo.");
  await setImmediate();
  s.narrator.stop();
  assert(signal.aborted);
  assert.equal(s.narrator.getMouthPose().open, 0);
  finish(response());
  await setImmediate();
  assert.equal(s.sources.length, 0);
  assert.equal(s.narrator.state, "idle");
});

test("spoken expansions drive lips even when they do not literally match the script", async (t) => {
  const s = setup(t, async () => response({ words: [{ text: "tiga", time: 0, duration: 0.6 }] }));
  s.narrator.play("3.");
  await setImmediate();
  s.context.currentTime = 0.21;
  const pose = s.narrator.getMouthPose();
  assert(pose.wide > 0.7, "The spoken i in tiga must shape lips despite the written digit");
  assert.equal(s.narrator.playback.timeline.map(item => item.sound).join(""), "tiga");
});

test("restart stops playing audio and ignores its late ended callback", async (t) => {
  const s = setup(t);
  s.narrator.play("Halo. Dua.");
  await setImmediate();
  const old = s.sources[0];
  s.narrator.play("Baru.");
  assert(old.stopped);
  assert.equal(old.onended, null);
  await setImmediate();
  assert.equal(s.sources.length, 2);
  assert.equal(s.sentences.at(-1).text, "Baru.");
  assert.equal(s.narrator.state, "speaking");
});

test("provider failure or wrong voice produces an error without browser fallback", async (t) => {
  const s = setup(t, async () => response({ voice: "id-ID-GadisNeural" }));
  s.narrator.play("Halo.");
  await setImmediate();
  assert.equal(s.narrator.state, "error");
  assert.equal(s.sources.length, 0);
  s.narrator.fetcher = async () => { throw new Error("Offline"); };
  s.narrator.play("Halo.");
  await setImmediate();
  assert.equal(s.narrator.state, "error");
  assert.equal(s.sources.length, 0);
});

test("vowel practice slows synthesis and Stop during a pause prevents the prefetched vowel", async (t) => {
  const requests = [];
  const s = setup(t, async (_, options) => { requests.push(JSON.parse(options.body)); return response(); });
  let finishPause;
  s.narrator.wait = () => new Promise(resolve => { finishPause = resolve; });
  s.narrator.play("a, i, u, e, o", { rate: 1.3 });
  await setImmediate();
  assert.deepEqual(requests, ["a.", "i.", "u.", "e.", "o."].map(text => ({ text, rate: 0.8 })));
  assert.equal(s.sentences[0].vowel, "a");
  s.sources[0].onended();
  await setImmediate();
  assert.equal(s.narrator.state, "pausing");
  assert.equal(s.narrator.getMouthPose().open, 0);
  s.narrator.stop();
  finishPause();
  await setImmediate();
  assert.equal(s.sources.length, 1);
  assert.equal(s.narrator.state, "idle");
});

test("vowel exercise waits for all five downloads and cancels preparation on Stop", async (t) => {
  const finish = [];
  const s = setup(t, () => new Promise(resolve => finish.push(() => resolve(response()))));
  s.narrator.play("a i u e o");
  await setImmediate();
  assert.equal(finish.length, 2, "At most two requests are prepared concurrently");
  finish[0](); finish[1]();
  await setImmediate();
  assert.equal(finish.length, 4);
  assert.equal(s.sources.length, 0, "Do not speak before the remaining vowels are ready");
  s.narrator.stop();
  finish[2](); finish[3]();
  await setImmediate();
  assert.equal(finish.length, 4, "Stop must prevent the last download");
  assert.equal(s.sources.length, 0);
  assert.equal(s.narrator.state, "idle");
});
