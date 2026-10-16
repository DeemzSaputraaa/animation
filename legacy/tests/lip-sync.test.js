import assert from "node:assert/strict";
import test from "node:test";
import { REST_MOUTH, buildVisemes, sampleVisemes, analyzeSpeechEnergy, audibleTime } from "../lip-sync.js";

test("Indonesian words distinguish vowels and close lips on M/B/P", () => {
  const timeline = buildVisemes([{ text: "bapak", time: 1, duration: 0.8 }, { text: "ibu", time: 2, duration: 0.6 }]);
  for (const segment of timeline) {
    const pose = sampleVisemes(timeline, (segment.start + segment.end) / 2);
    if (/[bmp]/.test(segment.sound)) assert.deepEqual(pose, REST_MOUTH);
    if (segment.sound === "a") assert(pose.open > 0.8);
    if (segment.sound === "i") assert(pose.wide > 0.8 && pose.round === 0);
    if (segment.sound === "u") assert(pose.round > 0.9 && pose.wide === 0);
  }
  for (const time of [0, 0.99, 1.9, 2.7, NaN]) assert.deepEqual(sampleVisemes(timeline, time), REST_MOUTH);
  assert.deepEqual(buildVisemes([{ text: "nyanyi", time: 0, duration: 1 }]).map(item => item.sound), ["ny", "a", "ny", "i"]);
});

test("word duration changes phoneme timing without a separate animation speed", () => {
  const short = buildVisemes([{ text: "buku", time: 0.3, duration: 0.6 }]);
  const slow = buildVisemes([{ text: "buku", time: 0.6, duration: 1.2 }]);
  for (let time = 0.35; time < 0.9; time += 0.03) {
    const a = short.find(item => time >= item.start && time < item.end);
    const b = slow.find(item => time * 2 >= item.start && time * 2 < item.end);
    assert.equal(a?.sound, b?.sound);
  }
});

test("PCM silence closes the mouth even inside an estimated vowel interval", () => {
  const pcm = new Float32Array(1000);
  for (let i = 100; i < 400; i++) pcm[i] = 0.15 * Math.sin(i * 0.6);
  const energy = analyzeSpeechEnergy({ sampleRate: 1000, getChannelData: () => pcm });
  const timeline = buildVisemes([{ text: "a", time: 0, duration: 0.9 }]);
  assert.deepEqual(sampleVisemes(timeline, 0.06, energy), REST_MOUTH);
  assert(sampleVisemes(timeline, 0.25, energy).open > 0.6);
  assert.deepEqual(sampleVisemes(timeline, 0.6, energy), REST_MOUTH);
});

test("lip timing uses the speaker clock and accounts for output delay", () => {
  assert.equal(audibleTime({ currentTime: 2, getOutputTimestamp: () => ({ contextTime: 1.8, performanceTime: 1000 }) }, 1050), 1.85);
  assert.equal(audibleTime({ currentTime: 2, outputLatency: 0.1, baseLatency: 0.05 }), 1.8499999999999999);
  assert.equal(audibleTime({ currentTime: 2, getOutputTimestamp: () => ({ contextTime: 1.9, performanceTime: 1000 }) }, 3000), 2);
});

test("five vowels keep distinct held shapes, including E versus I and O versus U", () => {
  const timeline = buildVisemes(["a", "i", "u", "e", "o"].map((text, time) => ({ text, time, duration: 0.6 })));
  const [a, i, u, e, o] = timeline.map(segment => sampleVisemes(timeline, segment.start + 0.3));
  assert(a.open > o.open && o.open > e.open && e.open > i.open);
  assert(i.wide > e.wide && e.wide > a.wide);
  assert(u.round > o.round && o.round > 0.8);
  assert.equal(u.wide, 0);
  assert.equal(o.wide, 0);
  for (const segment of timeline) {
    assert.deepEqual(sampleVisemes(timeline, segment.end + 0.1), REST_MOUTH);
    assert.deepEqual(sampleVisemes(timeline, segment.start + 0.2), sampleVisemes(timeline, segment.start + 0.4));
  }
});
