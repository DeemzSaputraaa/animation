import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { FaceController, faceWeights, manualFaceWeights } from '../frontend/animation/FaceController';
import { EXPRESSIONS, type ExpressionId } from '../frontend/expressions';
import { LipSyncController, REQUIRED_MORPHS } from '../frontend/animation/LipSyncController';
import type { Emotion, EmotionEvent } from '../frontend/types/performance';

const emotion = (label: Emotion, energy = .65): EmotionEvent[] => [{ start: 1, end: 4, emotion: label, energy }];

test('emotions have distinct readable eyes/brows and protect rounded vowels and lip closure', () => {
  const happy = faceWeights(emotion('happy'), 2, 0);
  const serious = faceWeights(emotion('serious'), 2, 0);
  const excited = faceWeights(emotion('excited', .85), 2, 0);
  const concerned = faceWeights(emotion('concerned'), 2, 0);
  assert(happy.smile > .7 && happy.cheekRaise > .4);
  assert(serious.browDown > .5 && serious.smile === 0);
  assert(excited.browUp > happy.browUp && excited.eyeWide > happy.eyeWide);
  assert(concerned.browInnerUp > .6 && concerned.frown > .5);
  const rounded = faceWeights(emotion('happy'), 2, 1);
  const closed = faceWeights(emotion('happy'), 2, 0, 1);
  assert(rounded.smile <= happy.smile * .26);
  assert.equal(closed.smile, 0);
  assert.equal(closed.browUp, happy.browUp, 'Lip closure must not suppress upper-face expression');
  assert(faceWeights(emotion('excited', .9), 2, 0).eyeWide > faceWeights(emotion('excited', .2), 2, 0).eyeWide);
});

test('expressions stay continuous between sentences and deterministic on pause/seek', () => {
  const events: EmotionEvent[] = [{ start: 1, end: 3, emotion: 'happy', energy: .7 }, { start: 3.1, end: 5, emotion: 'serious', energy: .5 }];
  let previous = faceWeights(events, .5, 0);
  for (let time = .51; time < 6; time += .01) {
    const current = faceWeights(events, time, 0);
    for (const channel of Object.keys(current) as (keyof typeof current)[]) {
      assert(current[channel] >= 0 && current[channel] <= 1);
      assert(Math.abs(current[channel] - previous[channel]) < .04, 'No expression snap at a sentence boundary');
    }
    previous = current;
  }
  assert(faceWeights(events, 3.05, 0).smile > .2, 'Keep expression through a short speech pause');
  const held = faceWeights(events, 3.2, 0);
  faceWeights(events, 6, 0);
  assert.deepEqual(faceWeights(events, 3.2, 0), held);
});

test('emphasized words animate brows, preserve visemes, and allow full blinks', () => {
  const model = new THREE.Group(), mesh = new THREE.Mesh();
  mesh.morphTargetDictionary = Object.fromEntries(REQUIRED_MORPHS.map((name, index) => [name, index]));
  mesh.morphTargetInfluences = REQUIRED_MORPHS.map(() => 0); model.add(mesh);
  const lips = new LipSyncController(model), face = new FaceController(lips);
  const read = (name: string) => mesh.morphTargetInfluences![mesh.morphTargetDictionary![name]];
  lips.set('viseme_A', .8);
  face.update(emotion('excited'), 2.2, 0);
  const plain = read('browUp');
  face.update(emotion('excited'), 2.2, 0, 0,
    [{ text: 'hebat', time: 2, duration: .5, char_index: 0 }],
    [{ text: 'hebat', char_start: 0, char_end: 5, start: 1, end: 4, emotion: 'excited', energy: .65, emphasis: ['hebat'] }]);
  assert(read('browUp') > plain);
  assert.equal(read('viseme_A'), .8);
  face.update(emotion('excited'), 2.96, 0);
  assert(read('blinkLeft') > .99 && read('blinkRight') > .99);
  assert(read('eyeWide') < .001, 'Widening must release during a blink');
});

test('manual expressions are distinct, intensity bounded, and leave speaking lips in control', () => {
  const sample = (expression: Exclude<ExpressionId, 'auto'>, intensity = 1, speaking = false) => manualFaceWeights(expression, intensity, 1, 0, 0, speaking);
  assert(sample('smile').smile < sample('pleased').smile);
  assert(sample('pleased').cheekRaise < sample('happy').cheekRaise);
  assert(sample('laugh').jawOpen > .15 && sample('laugh').squint > sample('happy').squint);
  assert(sample('sad').frown > .7 && sample('sad').browInnerUp > .8);
  assert(sample('angry').browDown > .9 && sample('angry').smile === 0);
  assert(sample('surprised').eyeWide > .8);
  for (const id of Object.keys(EXPRESSIONS).filter(id => id !== 'auto') as Exclude<ExpressionId, 'auto'>[]) {
    assert(Object.values(sample(id, 0)).every(value => value === 0));
    assert.deepEqual(sample(id, 2), sample(id, 1));
    const full = sample(id), half = sample(id, .5);
    for (const key of Object.keys(full) as (keyof typeof full)[]) assert.equal(half[key], full[key] * .5);
    const closed = manualFaceWeights(id, 1, 1, 0, 1, true);
    assert.equal(closed.smile, 0); assert.equal(closed.frown, 0); assert.equal(closed.jawOpen, 0);
    assert.equal(sample(id, 1, true).jawOpen, 0, 'Speaking and paused performances must use viseme jaw motion');
    assert.deepEqual(manualFaceWeights(id, .8, 2), manualFaceWeights(id, .8, 2), 'Sampling a paused face is deterministic');
  }
});

test('returning to automatic expressions releases the laughter jaw and keeps visemes', () => {
  const model = new THREE.Group(), mesh = new THREE.Mesh();
  const names = [...REQUIRED_MORPHS, 'jawOpen'];
  mesh.morphTargetDictionary = Object.fromEntries(names.map((name, index) => [name, index]));
  mesh.morphTargetInfluences = names.map(() => 0); model.add(mesh);
  const lips = new LipSyncController(model), face = new FaceController(lips);
  const read = (name: string) => mesh.morphTargetInfluences![mesh.morphTargetDictionary![name]];
  face.update([], 1, 0, 0, undefined, undefined, { expression: 'laugh', intensity: 1 });
  assert(read('jawOpen') > 0);
  lips.set('viseme_A', .8);
  face.update([], 1, 0, 0, undefined, undefined, { expression: 'laugh', intensity: 1, speaking: true });
  assert.equal(read('jawOpen'), 0); assert.equal(read('viseme_A'), .8);
  face.update(emotion('serious'), 2, 0, 0, undefined, undefined, { expression: 'auto', intensity: .3 });
  assert.equal(read('jawOpen'), 0);
  assert.equal(read('smile'), 0);
  assert.equal(read('browDown'), faceWeights(emotion('serious'), 2, 0).browDown);
});
