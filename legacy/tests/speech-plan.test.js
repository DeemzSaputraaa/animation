import assert from "node:assert/strict";
import test from "node:test";
import { prepareScript, deliveryRate, waitForPause } from "../speech-plan.js";

test("line breaks keep ideas separate and longer sentences prefer clause boundaries", () => {
  const parts = prepareScript("Pembuka. Kalimat kedua.\nGagasan berikutnya tanpa titik\nPenutup");
  assert.deepEqual(parts.map(part => part.text), ["Pembuka.", "Kalimat kedua.", "Gagasan berikutnya tanpa titik", "Penutup"]);
  assert(parts[1].pauseAfterMs > parts[0].pauseAfterMs);
  const clause = "Kita akan membahas informasi dan komunikasi yang membantu kegiatan sehari-hari dengan lebih teratur,";
  const text = `${clause} ${"kemudian ".repeat(25).trim()}.`;
  const long = prepareScript(text);
  assert.equal(long[0].text, clause);
  assert.equal(long.map(part => part.text).join(" "), text);
  assert(long.every(part => part.text.length <= 220));
});

test("vowels have individual phrases without changing ordinary words or manual slower rates", () => {
  for (const text of ["A, I, U, E, O", "a i u e o", "A. I. U. E. O."]) {
    const parts = prepareScript(text);
    assert.deepEqual(parts.map(part => part.text), ["a.", "i.", "u.", "e.", "o."]);
    assert(parts.every(part => part.pauseAfterMs === 400));
    assert.equal(deliveryRate(parts[0], 1.2), 0.8);
    assert.equal(deliveryRate(parts[0], 0.6), 0.6);
  }
  const ordinary = prepareScript("Ini audio untuk ibu.")[0];
  assert.equal(ordinary.text, "Ini audio untuk ibu.");
  assert.equal(ordinary.vowel, undefined);
  assert.equal(deliveryRate(ordinary, 1.1), 1.1);
});

test("aborting an inter-phrase pause resolves immediately", async () => {
  const controller = new AbortController();
  const waiting = waitForPause(60_000, controller.signal);
  controller.abort();
  await waiting;
  await waitForPause(60_000, controller.signal);
});
