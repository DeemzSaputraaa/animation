import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareCountClips, countNumber } from '../frontend/animation/countClips';
import { AnimationController } from '../frontend/animation/AnimationController';
import { BodyMotionController } from '../frontend/animation/BodyMotionController';
import { GestureController } from '../frontend/animation/GestureController';

for (const character of ['harry', 'character']) test(`${character}: ten readable count poses, exposed thumbs, stable pause/seek`, async () => {
  const loader = new GLTFLoader();
  loader.register(parser => { parser.loadTexture = async () => new THREE.Texture(); return { name: 'test-textures' }; });
  const bytes = fs.readFileSync(`frontend/public/models/${character}.glb`);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const bones = new Map<string, THREE.Object3D>();
  gltf.scene.traverse(node => { if ((node as THREE.Bone).isBone) bones.set(node.name.replace(/^mixamorig\d*:?/, ''), node); });
  const bone = (name: string) => bones.get(name)!;
  const original = [...bones.values()].map(bone => bone.quaternion.toArray());
  const clips = prepareCountClips(gltf.scene, gltf.animations);
  assert.deepEqual([...bones.values()].map(bone => bone.quaternion.toArray()), original, 'Preparing poses must not mutate the cached model');
  assert.equal(clips.filter(clip => countNumber(clip.name)).length, 10);
  const animation = new AnimationController(gltf.scene, clips);
  const gestures = new GestureController(animation, true), body = new BodyMotionController(gltf.scene);
  const sample = (count: number, time = 1) => {
    const event = { start: 0, duration: 2, animation: `gesture_count_${count}`, weight: 1, speed: 1, fade_in: .35, fade_out: .25 };
    animation.reset(); animation.sample('idle_neutral', time, 1, true); gestures.update([event], time); animation.evaluate();
    const authored = [...bones.values()].filter(bone => /Hand/.test(bone.name)).map(bone => bone.quaternion.clone().normalize());
    if (character === 'harry') body.update(time, [event]);
    if (count > 5) [...bones.values()].filter(bone => /Hand/.test(bone.name)).forEach((bone, i) => {
      assert(bone.quaternion.clone().normalize().angleTo(authored[i]) < 1e-6, 'Secondary movement must preserve both counting hands');
    });
    gltf.scene.updateMatrixWorld(true);
    return [...bones.values()].map(bone => bone.quaternion.clone().normalize());
  };
  for (let count = 1; count <= 10; count++) {
    const pose = sample(count);
    for (const [side, sign] of [['Right', 1], ['Left', -1]] as const) {
      if (side === 'Left' && count <= 5) continue;
      const expected = side === 'Right' ? Math.min(count, 5) : count - 5;
      const hand = bone(`${side}Hand`);
      const point = (name: string) => hand.worldToLocal(bone(`${side}Hand${name}`).getWorldPosition(new THREE.Vector3()));
      ['Index', 'Middle', 'Ring', 'Pinky'].forEach((digit, i) => {
        const reach = point(`${digit}4`).distanceTo(point(`${digit}1`));
        const length = [2, 3, 4].reduce((sum, joint) => sum + bone(`${side}Hand${digit}${joint}`).position.length(), 0);
        assert(i < expected ? reach / length > .97 : reach / length < .8, `Count ${count} ${side} ${digit}: reach ${reach / length}`);
      });
      const width = Math.abs(bone(`${side}HandIndex1`).position.x - bone(`${side}HandPinky1`).position.x);
      const length = bone(`${side}HandMiddle1`).position.y;
      const thumb = point('Thumb4');
      if (expected === 5) assert(thumb.x * sign > width * .8, `Count ${count}: thumb must open visibly to the side`);
      else {
        assert(thumb.x * sign > 0 && thumb.x * sign < width * .55, `Count ${count}: thumb must not bury itself across the palm`);
        assert(thumb.z > width * .7 && thumb.z < width * 1.2, `Count ${count}: thumb must rest outside the curled fingers (${thumb.z / width})`);
        assert(thumb.y > length * .7 && thumb.y < length * 1.2);
      }
      assert(hand.getWorldPosition(new THREE.Vector3()).y > 1.2, 'Counting palm must be raised');
    }
    sample(count, 1.5);
    sample(count).forEach((q, i) => assert(q.angleTo(pose[i]) < 1e-6, 'Backward seek restores the entire pose'));
    sample(count).forEach((q, i) => assert(q.angleTo(pose[i]) < 1e-6, 'Pause holds the entire pose'));
  }
  assert.equal(animation.missing.size, 0);
  animation.dispose();
});
