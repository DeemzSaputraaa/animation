import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationController } from '../frontend/animation/AnimationController';
import { LipSyncController } from '../frontend/animation/LipSyncController';
import { useAvatarStore } from '../frontend/stores/avatarStore';
import { BodyMotionController } from '../frontend/animation/BodyMotionController';
import { GestureController, relaxedGesture } from '../frontend/animation/GestureController';
import { IdleController } from '../frontend/animation/IdleController';
import { eventWeight } from '../frontend/animation/timeline';

test('Harry loads with mapped facial targets, grounded idle, and seekable presenter gestures', async () => {
  const bytes = fs.readFileSync('frontend/public/models/harry.glb');
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert(bytes.length < 30_000_000);
  assert(json.images.every((image: { uri?: string; bufferView?: number }) => !image.uri && image.bufferView !== undefined));
  const loader = new GLTFLoader();
  loader.register(parser => { parser.loadTexture = async () => new THREE.Texture(); return { name: 'test-textures' }; });
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const animation = new AnimationController(gltf.scene, gltf.animations);
  const lips = new LipSyncController(gltf.scene);
  for (const clip of gltf.animations) for (const track of clip.tracks) {
    assert(gltf.scene.getObjectByName(track.name.split('.')[0]), `Unbound track ${track.name}`);
  }
  for (const [logical, native] of [['viseme_A', 'viseme_aa'], ['viseme_MBP', 'viseme_PP'], ['viseme_FV', 'viseme_FF'], ['blinkLeft', 'eyeBlinkLeft'], ['smile', 'mouthSmileLeft'], ['smile', 'mouthSmileRight']]) {
    lips.set(logical, .7);
    for (const name of ['Wolf3D_Head', 'Wolf3D_Teeth']) {
      const mesh = gltf.scene.getObjectByName(name) as THREE.Mesh;
      assert.equal(mesh.morphTargetInfluences![mesh.morphTargetDictionary![native]], .7);
    }
    lips.set(logical, 0);
  }
  const sample = (gesture: string | null, time: number) => {
    animation.reset(); animation.sample('idle_neutral', time, 1, true);
    if (gesture) animation.sample(gesture, time, 1);
    animation.evaluate(); gltf.scene.updateMatrixWorld(true);
    return gltf.scene.getObjectByName('RightHand')!.getWorldPosition(new THREE.Vector3());
  };
  const idle = sample(null, 0);
  const bounds = new THREE.Box3().setFromObject(gltf.scene, true);
  assert(Math.abs(bounds.min.y) < .005, `Feet must touch the floor: ${bounds.min.y}`);
  assert(bounds.max.y > 1.6 && bounds.max.y < 2);
  let moved = 0;
  for (const clip of gltf.animations.filter(clip => clip.name.startsWith('gesture_'))) {
    const pose = sample(clip.name, .8);
    if (pose.distanceTo(idle) > .03) moved++;
    sample(clip.name, 2);
    assert(pose.distanceTo(sample(clip.name, .8)) < 1e-6, `${clip.name}: seek restores pose`);
  }
  assert(moved >= 8, `${moved} gestures moved the right hand`);
  animation.dispose();
});

test('character switching clears a failed load and resets readiness', () => {
  const store = useAvatarStore.getState();
  store.setModelError('Failed asset');
  store.setCharacter('ardi');
  assert.equal(useAvatarStore.getState().modelError, null);
  assert.equal(useAvatarStore.getState().modelReady, false);
  store.setModelReady(true);
  store.setCharacter('harry');
  assert.equal(useAvatarStore.getState().character, 'harry');
  assert.equal(useAvatarStore.getState().modelReady, false);
});

test('Harry has continuous relaxed arms without foot drift, pause drift, or damaged count poses', async () => {
  const loader = new GLTFLoader();
  loader.register(parser => { parser.loadTexture = async () => new THREE.Texture(); return { name: 'test-textures' }; });
  const bytes = fs.readFileSync('frontend/public/models/harry.glb');
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const animation = new AnimationController(gltf.scene, gltf.animations);
  const idle = new IdleController(animation, 1.2), body = new BodyMotionController(gltf.scene);
  const gestures = new GestureController(animation, true);
  const bone = (name: string) => gltf.scene.getObjectByName(name)!;
  const sample = (time: number, events: Parameters<typeof body.update>[1] = []) => {
    animation.reset(); idle.update(time); gestures.update(events!, time); animation.evaluate();
    gltf.scene.updateMatrixWorld(true);
    const feet = ['LeftFoot', 'RightFoot'].map(name => bone(name).getWorldPosition(new THREE.Vector3()));
    body.update(time, events); gltf.scene.updateMatrixWorld(true);
    feet.forEach((position, i) => assert(position.distanceTo(bone(['LeftFoot', 'RightFoot'][i]).getWorldPosition(new THREE.Vector3())) < 1e-9));
    return ['Spine', 'RightForeArm', 'RightHand', 'RightHandIndex2'].map(name => bone(name).quaternion.clone().normalize());
  };
  const initial = sample(1);
  for (let i = 0; i < 100; i++) sample(1).forEach((q, j) => assert(q.angleTo(initial[j]) < 1e-6, 'Pause must not accumulate body offsets'));
  const later = sample(3);
  assert(later[1].angleTo(initial[1]) > .02, 'The resting elbow must not remain rigid');
  assert(later[2].angleTo(initial[2]) > .02, 'The resting wrist must not remain rigid');
  sample(1).forEach((q, j) => assert(q.angleTo(initial[j]) < 1e-6, 'Backward seek restores secondary motion'));
  let previous = sample(7.9);
  for (let time = 7.91; time < 9.4; time += .01) {
    const current = sample(time);
    current.forEach((q, i) => assert(q.angleTo(previous[i]) < .02, 'Idle variant transition must stay continuous'));
    previous = current;
  }
  for (const count of [1, 2, 3]) {
    const event = { start: 0, duration: 2, animation: `gesture_count_${count}`, weight: 1, speed: 1, fade_in: .35, fade_out: .25 };
    animation.reset(); idle.update(1); gestures.update([event], 1); animation.evaluate();
    const fingers = ['Index', 'Middle', 'Ring', 'Pinky'].flatMap(digit => [1, 2, 3].map(joint => bone(`RightHand${digit}${joint}`)));
    const held = fingers.map(bone => bone.quaternion.clone().normalize());
    body.update(1, [event]);
    fingers.forEach((bone, i) => assert(bone.quaternion.clone().normalize().angleTo(held[i]) < 1e-6, 'Relaxation must not curl an authored count pose'));
    assert.deepEqual(relaxedGesture(event), event);
  }
  const cue = { start: 0, duration: 2.4, animation: 'gesture_open_hand', weight: .7, speed: 1 };
  assert(eventWeight(relaxedGesture(cue), .15) < eventWeight(cue, .15) * .5, 'Slower approach to the gesture');
  assert(eventWeight(relaxedGesture(cue), 2.25) < eventWeight(cue, 2.25) * .5, 'Longer recovery from the gesture');
  assert.equal(eventWeight(relaxedGesture(cue), 1.2), .7, 'Keep the full gesture at its peak');
  animation.dispose();
});
