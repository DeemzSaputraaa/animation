import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { REQUIRED_MORPHS } from '../frontend/animation/LipSyncController';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationController } from '../frontend/animation/AnimationController';
import { GestureController } from '../frontend/animation/GestureController';

test('runtime GLB contains the rig, required facial targets, and modular clips within size budget', () => {
  const file = fs.readFileSync('frontend/public/models/character.glb');
  assert.equal(file.toString('ascii', 0, 4), 'glTF');
  assert(file.length < 30_000_000);
  const length = file.readUInt32LE(12);
  const gltf = JSON.parse(file.toString('utf8', 20, 20 + length));
  assert(gltf.skins.length > 0 && gltf.skins[0].joints.length > 30);
  const morphs = gltf.meshes.flatMap((mesh: { extras?: { targetNames?: string[] } }) => mesh.extras?.targetNames ?? []);
  for (const name of REQUIRED_MORPHS) assert(morphs.includes(name), `Missing ${name}`);
  const names = gltf.animations.map((clip: { name: string }) => clip.name);
  for (const name of ['idle_neutral', 'idle_breathing', 'idle_shift_weight', 'idle_relaxed', 'head_nod', 'head_shake', 'head_tilt_left', 'head_tilt_right']) assert(names.includes(name));
  assert(names.filter((name: string) => name.startsWith('gesture_')).length >= 8);
  assert(gltf.images.every((image: { uri?: string; bufferView?: number }) => !image.uri && image.bufferView !== undefined), 'Textures must be embedded');
});

test('baked gesture clips move the real skeleton and can be sampled backwards', async () => {
  const loader = new GLTFLoader();
  loader.register(parser => {
    // Browser smoke tests load real embedded images; the skeleton test needs
    // no image decoder and substitutes only texture loading.
    parser.loadTexture = async () => new THREE.Texture();
    return { name: 'test-textures' };
  });
  const bytes = fs.readFileSync('frontend/public/models/character.glb');
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const animation = new AnimationController(gltf.scene, gltf.animations);
  const hand = gltf.scene.getObjectByName('mixamorig9RightHand')!;
  const sample = (gesture: string | null, time: number) => {
    animation.reset(); animation.sample('idle_neutral', time, 1, true);
    if (gesture) animation.sample(gesture, time, .75);
    animation.evaluate(); gltf.scene.updateMatrixWorld(true);
    return hand.getWorldPosition(new THREE.Vector3());
  };
  const neutral = sample(null, 1.2);
  let moved = 0;
  for (const name of ['gesture_open_hand', 'gesture_explain_right', 'gesture_both_hands', 'gesture_emphasis', 'gesture_point', 'gesture_count', 'gesture_question']) {
    const pose = sample(name, 1.2);
    if (pose.distanceTo(neutral) > .03) moved++;
    sample(name, 2);
    assert(pose.distanceTo(sample(name, 1.2)) < .000001, `${name}: seek must recover the same skeletal pose`);
  }
  assert(moved >= 5, `${moved} gestures moved the hand by at least 3 cm`);
  animation.dispose();
});

test('word-timed count clips extend exactly 1, 2, 3 fingers and hold the arm across transitions', async () => {
  const loader = new GLTFLoader();
  loader.register(parser => { parser.loadTexture = async () => new THREE.Texture(); return { name: 'test-textures' }; });
  const bytes = fs.readFileSync('frontend/public/models/character.glb');
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const digits = ['Index', 'Middle', 'Ring', 'Pinky'];
  const fingers = digits.map(digit => [1, 2, 3].map(joint => gltf.scene.getObjectByName(`mixamorig9RightHand${digit}${joint}`)!));
  const bind = fingers.map(joints => joints.map(bone => bone.quaternion.clone().normalize()));
  const animation = new AnimationController(gltf.scene, gltf.animations), gestures = new GestureController(animation);
  const events = [
    { start: .65, duration: .85, animation: 'gesture_count_1', fade_in: .35, fade_out: .12, weight: 1, speed: 1 },
    { start: 1.38, duration: .62, animation: 'gesture_count_2', fade_in: .12, fade_out: .12, weight: 1, speed: 1 },
    { start: 1.88, duration: .87, animation: 'gesture_count_3', fade_in: .12, fade_out: .25, weight: 1, speed: 1 },
  ];
  const sample = (time: number) => {
    animation.reset(); animation.sample('idle_neutral', time, 1, true); gestures.update(events, time); animation.evaluate();
    return fingers.map(joints => joints.map(bone => bone.quaternion.clone().normalize()));
  };
  for (const [count, time] of [[1, 1], [2, 1.5], [3, 2]]) {
    const pose = sample(time);
    gltf.scene.updateMatrixWorld(true);
    const hand = gltf.scene.getObjectByName('mixamorig9RightHand')!;
    const thumbTip = hand.worldToLocal(gltf.scene.getObjectByName('mixamorig9RightHandThumb4')!.getWorldPosition(new THREE.Vector3()));
    const indexBase = fingers[0][0].position, pinkyBase = fingers[3][0].position;
    const palmWidth = indexBase.x - pinkyBase.x, palmLength = fingers[1][0].position.y;
    assert(thumbTip.x > pinkyBase.x && thumbTip.x < 0, `count ${count}: thumb must fold across the palm toward the ring finger`);
    assert(thumbTip.y > palmLength * .5 && thumbTip.y < palmLength, 'Thumb must stay over the palm instead of pointing below the wrist');
    assert(thumbTip.z > 0 && thumbTip.z < palmWidth * .75, 'Thumb must stay close to the palm instead of sticking out');
    pose.forEach((joints, digit) => joints.forEach((q, joint) => {
      const angle = bind[digit][joint].angleTo(q);
      assert(digit < count ? angle < .04 : angle > .75, `count ${count}: ${digits[digit]} joint ${joint + 1} must be ${digit < count ? 'straight' : 'folded'}, got ${angle}`);
    }));
    sample(3);
    const recovered = sample(time);
    pose.forEach((joints, digit) => joints.forEach((q, joint) => assert(q.angleTo(recovered[digit][joint]) < .00001, 'Seek restores every finger')));
  }
  sample(1.2);
  const armBones = ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'].map(name => gltf.scene.getObjectByName(`mixamorig9${name}`)!);
  const held = armBones.map(bone => bone.quaternion.clone().normalize());
  for (const time of [1.4, 1.44, 1.48, 1.5, 1.94, 2, 2]) {
    sample(time);
    armBones.forEach((bone, index) => assert(held[index].angleTo(bone.quaternion.clone().normalize()) < .00001, 'The arm stays raised during transitions and pause'));
  }
  animation.dispose();
});
