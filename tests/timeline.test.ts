import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { eventWeight, prepareLipTimeline, visemeWeights, blinkWeight } from '../frontend/animation/timeline';
import { AnimationController } from '../frontend/animation/AnimationController';
import { LookController } from '../frontend/animation/LookController';
import { GestureController } from '../frontend/animation/GestureController';
import { IdleController } from '../frontend/animation/IdleController';

test('visemes follow audio positions, blend vowels, close MBP and rest in gaps', () => {
  const events = [
    { time: 0, end: .3, viseme: 'A', weight: 1 }, { time: .3, end: .6, viseme: 'O', weight: 1 },
    { time: .6, end: .8, viseme: 'MBP', weight: 1 }, { time: .8, end: 1, viseme: 'rest', weight: 0 },
  ];
  assert.deepEqual(visemeWeights(events, .15), { A: 1 });
  const blend = visemeWeights(events, .315);
  assert(blend.A > 0 && blend.O > 0);
  assert.deepEqual(visemeWeights(events, .605), { MBP: 1 });
  for (const time of [-1, .9, 1.3, NaN]) assert.deepEqual(visemeWeights(events, time), {});
  const original = visemeWeights(events, .315);
  visemeWeights(events, .9); assert.deepEqual(visemeWeights(events, .315), original, 'seeking backwards must be deterministic');
});

test('gesture fades are bounded and disappear after the event', () => {
  const event = { start: 2, duration: 2.4, animation: 'gesture_point', weight: .7, speed: 1 };
  for (const time of [0, 2, 4.4, 8]) assert.equal(eventWeight(event, time), 0);
  assert(eventWeight(event, 2.1) < eventWeight(event, 2.3));
  assert.equal(eventWeight(event, 3), .7);
  assert(eventWeight(event, 4.3) < .7);
});

test('brief consonants do not repeatedly snap the jaw closed between held vowels', () => {
  const events = [
    { time: 0, end: .15, viseme: 'A', weight: 1 },
    { time: .15, end: .18, viseme: 'rest', weight: 0 },
    { time: .18, end: .35, viseme: 'A', weight: 1 },
    { time: .35, end: .39, viseme: 'L', weight: 1 },
    { time: .39, end: .55, viseme: 'I', weight: 1 },
    { time: .55, end: .59, viseme: 'MBP', weight: 1 },
    { time: .59, end: .8, viseme: 'U', weight: 1 },
    { time: .8, end: 1, viseme: 'rest', weight: 0 },
  ];
  const prepared = prepareLipTimeline(events);
  assert.equal(prepared.length, 5);
  assert.deepEqual(visemeWeights(prepared, .165), { A: 1 });
  assert.equal(events[0].end, .15, 'Preparation must not change the original performance timeline');
  assert.deepEqual(visemeWeights(prepared, .57), { MBP: 1 });
  assert.deepEqual(visemeWeights(prepared, .9), {});
  assert.equal(prepared.at(-1)?.end, 1, 'Smoothing must not extend or slow down the audio timeline');
});

test('vowel transition spans both sides of its boundary and stays continuous', () => {
  const events = [{ time: 0, end: .3, viseme: 'A', weight: 1 }, { time: .3, end: .6, viseme: 'O', weight: 1 }];
  assert(visemeWeights(events, .26).O > 0);
  assert(visemeWeights(events, .34).A > 0);
  assert(Math.abs(visemeWeights(events, .3).A - .5) < .000001);
  let previous = visemeWeights(events, .24);
  for (let time = .25; time <= .36; time += .01) {
    const weights = visemeWeights(events, time);
    assert(Math.abs((weights.O ?? 0) - (previous.O ?? 0)) < .15, 'No abrupt change between nearby audio samples');
    assert(Math.abs((weights.A ?? 0) + (weights.O ?? 0) - 1) < .000001);
    previous = weights;
  }
});

test('irregular blinks can be sampled identically after pause and seek', () => {
  assert(blinkWeight(2.96) > .9);
  assert.equal(blinkWeight(4), 0);
  assert.equal(blinkWeight(3), blinkWeight(3 + 24.1));
});

test('procedural head offsets do not accumulate while audio is paused', () => {
  const model = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'Head'; model.add(bone);
  const clip = new THREE.AnimationClip('idle_neutral', 4, [new THREE.QuaternionKeyframeTrack('Head.quaternion', [0, 4], [0, 0, 0, 1, 0, 0, 0, 1])]);
  const animation = new AnimationController(model, [clip]), look = new LookController(model), camera = new THREE.PerspectiveCamera();
  camera.position.set(.2, .1, 3);
  let initial: THREE.Quaternion | undefined;
  for (let i = 0; i < 100; i++) {
    animation.reset(); animation.sample('idle_neutral', 1.5, 1, true); animation.evaluate(); look.update(1.5, camera);
    initial ??= bone.quaternion.clone();
    assert(initial.angleTo(bone.quaternion) < .000001);
  }
  animation.dispose();
});

test('hand gestures receive their full weight without interrupting the legs or opposite arm', () => {
  const model = new THREE.Group();
  const bones = ['Hips', 'RightArm', 'LeftArm', 'Head'].map(name => { const bone = new THREE.Bone(); bone.name = name; model.add(bone); return bone; });
  const rotation = (name: string, angle: number) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle).toArray();
    return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 4], [...q, ...q]);
  };
  const idleTracks: THREE.KeyframeTrack[] = bones.map(bone => rotation(bone.name, 0));
  idleTracks.push(new THREE.VectorKeyframeTrack('Hips.position', [0, 4], [0, 1, 0, 0, 1, 0]));
  const clips = ['idle_neutral', 'idle_breathing', 'idle_relaxed', 'idle_shift_weight'].map(name => new THREE.AnimationClip(name, 4, idleTracks));
  clips.push(new THREE.AnimationClip('gesture_point', 4, [rotation('RightArm', 1)]));
  clips.push(new THREE.AnimationClip('head_nod', 4, [rotation('Head', .4)]));
  const animation = new AnimationController(model, clips), idle = new IdleController(animation), gestures = new GestureController(animation);
  const event = { start: 0, duration: 3, animation: 'gesture_point', weight: .7, speed: 1 };
  const sample = (time: number) => {
    animation.reset(); idle.update(time); gestures.update([event], time);
    gestures.update([{ ...event, animation: 'head_nod', weight: .35 }], time); animation.evaluate();
  };
  sample(1);
  assert(Math.abs(bones[1].quaternion.angleTo(new THREE.Quaternion()) - .7) < .00001, 'Idle must not dilute the 70% arm gesture to 41%');
  assert(bones[2].quaternion.angleTo(new THREE.Quaternion()) < .00001);
  assert.deepEqual(bones[0].position.toArray(), [0, 1, 0]);
  assert(Math.abs(bones[3].quaternion.angleTo(new THREE.Quaternion()) - .14) < .00001);
  const held = bones[1].quaternion.clone().normalize();
  sample(1); assert(held.angleTo(bones[1].quaternion.clone().normalize()) < .00001, 'Pause must hold the hand pose');
  sample(3.2); assert(bones[1].quaternion.angleTo(new THREE.Quaternion()) < .00001, 'After the gesture, the arm returns to idle');
  sample(1); assert(held.angleTo(bones[1].quaternion.clone().normalize()) < .00001, 'Seek restores the same gesture');
  animation.dispose();
});
