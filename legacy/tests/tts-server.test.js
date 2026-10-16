import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createTtsMiddleware } from "../server/tts.js";

test("TTS endpoint validates requests and forwards only text and rate", async (t) => {
  const calls = [];
  const middleware = createTtsMiddleware(async (data) => { calls.push(data); return { voice: "id-ID-ArdiNeural", audio: "AQID", words: [] }; });
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}/api/tts`;
  const post = (body, headers = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await fetch(url)).status, 405);
  assert.equal((await post({ text: "Halo", rate: 0.95 }, { Origin: "https://example.com" })).status, 403);
  for (const body of [null, {}, { text: "a".repeat(221), rate: 1 }, { text: "Halo", rate: 4 }]) assert.equal((await post(body)).status, 400);
  assert.equal(calls.length, 0);
  const result = await post({ text: "Halo", rate: 0.95, voice: "other", command: "ignored" });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).voice, "id-ID-ArdiNeural");
  assert.deepEqual(calls, [{ text: "Halo", rate: 0.95 }]);
});
