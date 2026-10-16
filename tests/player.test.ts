import assert from 'node:assert/strict';
import test from 'node:test';
import { useAvatarStore } from '../frontend/stores/avatarStore';

test('Generation errors retain the provider message without reporting cancellation', async t => {
  const originalFetch = globalThis.fetch;
  const message = 'Layanan suara Microsoft menolak permintaan (403).';
  const stages: string[] = [];
  const requests: string[] = [];
  useAvatarStore.getState().setText('Halo.');
  const unsubscribe = useAvatarStore.subscribe(state => stages.push(state.stage));
  globalThis.fetch = async (input, init) => {
    requests.push(`${init?.method || 'GET'} ${input}`);
    return new Response(JSON.stringify({ id: 'failed', status: 'error', error: message }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  t.after(() => { unsubscribe(); useAvatarStore.getState().setText(''); globalThis.fetch = originalFetch; });
  await useAvatarStore.getState().generate();
  assert.equal(useAvatarStore.getState().state, 'error');
  assert.equal(useAvatarStore.getState().stage, 'Gagal membuat performa.');
  assert.equal(useAvatarStore.getState().error, message);
  assert.equal(useAvatarStore.getState().timeline, null);
  assert.ok(stages.every(stage => !stage.includes('dibatalkan')));
  assert.ok(requests.includes('DELETE /api/performance/failed'), 'Failure must still clean up the server job');
});

test('Explicit cancellation still stops generation and displays cancellation', async t => {
  const originalFetch = globalThis.fetch;
  let created: () => void = () => {};
  const started = new Promise<void>(resolve => { created = resolve; });
  globalThis.fetch = async () => {
    created();
    return new Response(JSON.stringify({ id: 'cancelled', status: 'generating', stage: 'Membuat suara', status_url: '/api/performance/cancelled' }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  t.after(() => { useAvatarStore.getState().setText(''); globalThis.fetch = originalFetch; });
  useAvatarStore.getState().setText('Halo.');
  const generating = useAvatarStore.getState().generate();
  await started;
  useAvatarStore.getState().cancel();
  await generating;
  assert.equal(useAvatarStore.getState().state, 'idle');
  assert.equal(useAvatarStore.getState().stage, 'Pembuatan dibatalkan.');
  assert.equal(useAvatarStore.getState().error, null);
});

test('Stop wins over a pending browser play promise and edits invalidate generated audio', async t => {
  const originalFetch = globalThis.fetch, originalAudio = globalThis.Audio;
  let finishPlay: () => void = () => {};
  class FakeAudio extends EventTarget {
    src = ''; preload = ''; currentTime = 0; duration = 4; paused = true; ended = false;
    load() { if (this.src) queueMicrotask(() => this.dispatchEvent(new Event('canplay'))); }
    removeAttribute() { this.src = ''; }
    pause() { this.paused = true; }
    play() { this.paused = false; return new Promise<void>(resolve => { finishPlay = resolve; }); }
  }
  globalThis.Audio = FakeAudio as unknown as typeof Audio;
  const timeline = { version: 1, duration: 4, visemes: [], gestures: [], sentences: [], words: [], emotion: [], head: [], warnings: [] };
  const sent: { voice: string }[] = [];
  globalThis.fetch = async (input, init) => {
    if (String(input) === '/api/performance') sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(String(input) === '/api/performance'
      ? { id: 'test', status: 'ready', audio_url: '/audio.mp3', timeline_url: '/timeline.json', status_url: '/api/performance/test' } : timeline), { headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { useAvatarStore.getState().setText(''); globalThis.fetch = originalFetch; globalThis.Audio = originalAudio; });
  useAvatarStore.getState().setText('Halo.');
  useAvatarStore.getState().setModelReady(true);
  await useAvatarStore.getState().generate();
  assert.equal(useAvatarStore.getState().state, 'ready');
  const prepared = useAvatarStore.getState().timeline;
  useAvatarStore.getState().setExpression('angry');
  useAvatarStore.getState().setExpressionIntensity(.5);
  assert.equal(useAvatarStore.getState().timeline, prepared, 'Changing expression must not invalidate generated audio');
  assert.equal(useAvatarStore.getState().state, 'ready');
  useAvatarStore.getState().setExpression('auto');
  const playing = useAvatarStore.getState().play();
  useAvatarStore.getState().stop();
  finishPlay(); await playing;
  assert.equal(useAvatarStore.getState().state, 'ready');
  assert.equal(useAvatarStore.getState().currentTime, 0);
  useAvatarStore.getState().setSpeechStyle('normal');
  assert.equal(useAvatarStore.getState().rate, .95);
  assert.equal(useAvatarStore.getState().timeline, null, 'Changing speech style must discard the old audio and timings');
  assert.equal(useAvatarStore.getState().audioUrl, null);
  assert.equal(useAvatarStore.getState().state, 'idle');
  useAvatarStore.getState().setSpeechStyle('relaxed');
  assert.equal(useAvatarStore.getState().rate, .85);
  useAvatarStore.getState().setSpeechStyle('conversational');
  assert.equal(useAvatarStore.getState().rate, .95);
  useAvatarStore.getState().setText('Naskah baru.');
  assert.equal(useAvatarStore.getState().timeline, null);
  assert.equal(useAvatarStore.getState().audioUrl, null);
  assert.equal(useAvatarStore.getState().state, 'idle');
  await useAvatarStore.getState().generate();
  assert.equal(sent.at(-1)?.voice, 'default');
});
