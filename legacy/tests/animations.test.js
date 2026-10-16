import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { createGestureClips } from "../animations.js";
import { addSpeechAnimation, speechPose } from "../speech.js";
import { addExpressions, blinkEnvelope } from "../expressions.js";
import { AutonomousCharacter } from "../autonomous.js";
import { gestureEnvelope } from "../gestures.js";

// Inspect the real skeleton in Node; image decoding is covered by browser checks.
const loadTexture = THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load = () => new THREE.Texture();
const bytes = fs.readFileSync(new URL("../public/models/hip-hop-dancing.fbx", import.meta.url));
let model;
try {
  model = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
} finally {
  THREE.TextureLoader.prototype.load = loadTexture;
}
model.scale.setScalar(0.01);
const clips = createGestureClips(model);
const faceMesh = addSpeechAnimation(model, { ...clips, dance: model.animations[0] });
const mixer = new THREE.AnimationMixer(model);
const position = (name) => model.getObjectByName(`mixamorig9${name}`).getWorldPosition(new THREE.Vector3());

test("custom gestures loop seamlessly with finite, normalized rotations", () => {
  for (const clip of Object.values(clips)) {
    assert(clip.validate());
    for (const track of clip.tracks) {
      assert([...track.values].every(Number.isFinite));
      if (track.getValueSize() !== 4) continue;
      const first = new THREE.Quaternion().fromArray(track.values);
      const last = new THREE.Quaternion().fromArray(track.values, track.values.length - 4);
      assert(first.angleTo(last) < 0.001, `${clip.name}: loop must not jump`);
      for (let i = 0; i < track.values.length; i += 4) {
        assert(Math.abs(new THREE.Quaternion().fromArray(track.values, i).length() - 1) < 0.00001);
      }
    }
  }
});

test("wave raises a moving hand; talk gestures forward; feet remain planted", () => {
  for (const [name, clip] of Object.entries(clips)) {
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play();
    mixer.setTime(0);
    model.updateMatrixWorld(true);
    const feet = [position("RightFoot"), position("LeftFoot")];
    const hand = position("RightHand");
    if (name === "wave") assert(hand.y > position("RightArm").y + 0.15);
    if (name === "talk") assert(hand.z > position("Spine").z + 0.2);
    mixer.update(0.37);
    model.updateMatrixWorld(true);
    assert(feet[0].distanceTo(position("RightFoot")) < 0.0001);
    assert(feet[1].distanceTo(position("LeftFoot")) < 0.0001);
    if (name !== "idle") assert(hand.distanceTo(position("RightHand")) > 0.005);
  }
});

test("crossfading from the original dance restores the standing root position", () => {
  mixer.stopAllAction();
  const wave = mixer.clipAction(clips.wave).reset().play();
  mixer.update(0);
  const standing = model.getObjectByName("mixamorig9Hips").position.clone();
  wave.stop();
  const dance = mixer.clipAction(model.animations[0]).reset().play();
  mixer.update(2);
  dance.fadeOut(0.4);
  wave.reset().fadeIn(0.4).play();
  for (let i = 0; i < 30; i++) mixer.update(1 / 60);
  dance.stop();
  mixer.update(0);
  assert(standing.distanceTo(model.getObjectByName("mixamorig9Hips").position) < 0.0001);
});

test("mouth deformation affects the lower face without changing the rest of the mesh", () => {
  const source = faceMesh.geometry.attributes.position;
  for (const target of faceMesh.geometry.morphAttributes.position) {
    let changed = 0;
    for (let i = 0; i < source.count; i++) {
      const start = new THREE.Vector3().fromBufferAttribute(source, i);
      const end = new THREE.Vector3().fromBufferAttribute(target, i);
      const displacement = start.distanceTo(end);
      assert(Number.isFinite(displacement));
      assert(displacement < 2, "Jaw displacement must stay below two FBX centimeters");
      if (displacement > 0) {
        changed++;
        assert(start.y > 154.5 && start.y < 164.7);
        assert(Math.abs(start.x) < 6.3 && start.z > 3.5);
      }
    }
    assert(changed > 100, "The lips and jaw must actually deform");
    assert(changed < source.count * 0.1, "The rest of the body must remain untouched");
  }
});

test("talk moves the mouth, pause freezes it, and other modes close it", () => {
  mixer.stopAllAction();
  const talk = mixer.clipAction(clips.talk).reset().play();
  mixer.setTime(0.52);
  assert(faceMesh.morphTargetInfluences[0] > 0.8);
  const opening = faceMesh.morphTargetInfluences[0];
  mixer.update(0);
  assert.equal(faceMesh.morphTargetInfluences[0], opening);
  mixer.update(0.14);
  assert(faceMesh.morphTargetInfluences[0] < 0.01);
  for (const clip of [clips.idle, clips.wave, model.animations[0]]) {
    mixer.stopAllAction();
    talk.reset().play();
    mixer.setTime(0.52);
    talk.fadeOut(0.4);
    mixer.clipAction(clip).reset().fadeIn(0.4).play();
    for (let i = 0; i < 30; i++) mixer.update(1 / 60);
    talk.stop();
    mixer.update(0);
    assert(faceMesh.morphTargetInfluences.every((value) => Math.abs(value) < 0.0001));
  }
  assert.deepEqual(speechPose(0), speechPose(6));
  assert.deepEqual(speechPose(2.2), [0, 0], "Include pauses between phrases");
});

test("autonomous behavior varies moods and speech while walking within the stage", () => {
  mixer.stopAllAction();
  const gestures = createGestureClips(model);
  addExpressions(faceMesh);
  const geometry = faceMesh.geometry;
  for (const group of geometry.groups.filter((group) => faceMesh.material[group.materialIndex].name === "Ch06_body1")) {
    for (let i = group.start; i < group.start + group.count; i++) {
      for (const target of geometry.morphAttributes.position.slice(2)) {
        for (let axis = 0; axis < 3; axis++) assert.equal(target.getComponent(i, axis), geometry.attributes.position.getComponent(i, axis), "Expressions must not deform the cap");
      }
    }
  }
  let seed = 187;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const character = new AutonomousCharacter(model, faceMesh, gestures, random);
  const visited = new Set();
  const seenGestures = new Set();
  const lastRotations = new Map();
  let walked = false, opened = false, pausedSpeech = false, footLifted = false;
  let blinkClosures = 0;
  let wasClosed = false;
  const lastRoll = { Left: 0, Right: 0 };
  const initialLeft = position("LeftFoot").y;
  const initialRight = position("RightFoot").y;
  for (let frame = 0; frame < 3600; frame++) {
    character.update(1 / 30);
    visited.add(character.mood);
    if (character.gestures.amount > 0.5) seenGestures.add(character.gestures.name);
    walked ||= Math.abs(model.position.x) > 0.25;
    opened ||= faceMesh.morphTargetInfluences[0] > 0.3;
    pausedSpeech ||= !character.speaking && faceMesh.morphTargetInfluences[0] < 0.01;
    const closed = faceMesh.morphTargetInfluences[faceMesh.morphTargetDictionary.blink] > 0.9;
    if (closed && !wasClosed) blinkClosures++;
    wasClosed = closed;
    for (const side of ["Left", "Right"]) {
      const hand = character.rig[`${side}Hand`];
      assert(hand.bone.quaternion.angleTo(hand.bindQuaternion) <= 0.381, "The wrist must stay aligned with the forearm");
      const roll = character.gestures.armStates[side].roll;
      assert(Math.abs(roll) <= Math.PI / 3 + 0.001, "Forearm roll must stay within its range");
      assert(Math.abs(roll - lastRoll[side]) < 0.041, "Forearm roll must not flip between poses");
      lastRoll[side] = roll;
    }
    footLifted ||= position("LeftFoot").y > initialLeft + 0.025;
    assert(Math.abs(model.position.x) < 0.7 && Math.abs(model.position.z) < 0.35);
    assert(position("Hips").y > 0.93 && position("Hips").y < 0.98, "Walking offsets must not accumulate into a crouch");
    assert(position("Head").y > 1.5, "The character must stay upright over time");
    assert(position("LeftFoot").y >= initialLeft - 0.005, "Left foot must not sink into the ground");
    assert(position("RightFoot").y >= initialRight - 0.005, "Right foot must not sink into the ground");
    assert(faceMesh.morphTargetInfluences.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
    for (const [name, { bone }] of Object.entries(character.rig)) {
      assert(bone.quaternion.toArray().every(Number.isFinite));
      assert(Math.abs(bone.quaternion.length() - 1) < 0.001);
      if (/Arm|Hand|Head/.test(name) && frame > 0) {
        assert(lastRotations.get(name).angleTo(bone.quaternion) < 0.4, `${name}: sudden rotation during transition`);
      }
      lastRotations.set(name, bone.quaternion.clone());
    }
  }
  assert.deepEqual([...visited].sort(), ["angry", "happy", "joyful", "relaxed", "sad"]);
  assert(walked && footLifted, "Walking must move both the root and feet");
  assert(opened && pausedSpeech, "Speech must alternate with natural pauses");
  assert(blinkClosures >= 10, "The character must blink repeatedly while active");
  const blink = geometry.morphAttributes.position[faceMesh.morphTargetDictionary.blink];
  for (let i = 65262; i < 69678; i++) {
    for (let axis = 0; axis < 3; axis++) assert.equal(blink.getComponent(i, axis), geometry.attributes.position.getComponent(i, axis), "Blinking must not deform the eyeballs");
  }
  assert(seenGestures.has("pointRight"));
  assert(seenGestures.size >= 5, "Conversation must use several distinct gestures");
  const before = faceMesh.morphTargetInfluences.slice();
  character.update(0);
  assert.deepEqual(faceMesh.morphTargetInfluences, before, "A hidden tab must not advance the animation");

  // Inspect a held point in a stationary pose, including the actual finger rig.
  character.walking = false;
  character.walkWait = 100;
  character.mode = "talk";
  character.behaviorLeft = 100;
  character.gestures.name = "pointRight";
  character.gestures.duration = 100;
  character.gestures.elapsed = 35;
  for (let i = 0; i < 120; i++) character.update(1 / 60);
  const index = character.rig.RightHandIndex2;
  const middle = character.rig.RightHandMiddle2;
  assert(index.bone.quaternion.angleTo(index.bindQuaternion) < 0.08, "The pointing index finger must remain extended");
  assert(middle.bone.quaternion.angleTo(middle.bindQuaternion) > 0.9, "The remaining fingers must curl for pointing");
  const hand = model.worldToLocal(position("RightHand"));
  assert(hand.x < -50 && hand.y > 140, "Pointing must extend the arm outward");

  character.mood = "happy";
  character.moodLeft = 100;
  character.gestures.name = "explain";
  character.gestures.elapsed = 35;
  for (let i = 0; i < 120; i++) character.update(1 / 60);
  const heights = { Left: [], Right: [] };
  for (let i = 0; i < 300; i++) {
    character.update(1 / 60);
    for (const side of ["Left", "Right"]) {
      heights[side].push(position(`${side}Hand`).y);
      const wrist = character.rig[`${side}Hand`];
      assert(wrist.bone.quaternion.angleTo(wrist.bindQuaternion) <= 0.381);
    }
  }
  for (const samples of Object.values(heights)) {
    assert(Math.max(...samples) - Math.min(...samples) > 0.07, "Speaking hands must visibly rise and fall");
    assert(samples.some((height, i) => i > 0 && height > samples[i - 1] + 0.0001));
    assert(samples.some((height, i) => i > 0 && height < samples[i - 1] - 0.0001));
  }

  character.setPresenterMode();
  for (let i = 0; i < 60; i++) character.update(1 / 60);
  assert.equal(character.speaking, false);
  assert(faceMesh.morphTargetInfluences[0] < 0.001, "Presenter must wait silently before audio starts");
  character.beginSentence({ gesture: "count", count: 3, mood: "happy" });
  for (let i = 0; i < 120; i++) character.update(1 / 60);
  assert(character.speaking);
  for (const digit of ["Index", "Middle", "Ring"]) {
    const finger = character.rig[`RightHand${digit}2`];
    assert(finger.bone.quaternion.angleTo(finger.bindQuaternion) < 0.08, "Counting three must extend three fingers");
  }
  character.speechBoundary({ text: "Halo", charIndex: 0, name: "word" });
  character.update(1 / 30);
  assert.equal(faceMesh.morphTargetInfluences[0], 0, "Word callbacks must not restart random mouth movement");
  character.mouthPose = { open: 0.22, round: 0, wide: 0.85 };
  character.update(1 / 60);
  assert.equal(faceMesh.morphTargetInfluences[0], 0.22);
  assert.equal(faceMesh.morphTargetInfluences[faceMesh.morphTargetDictionary.SpeechWide], 0.85);
  character.mouthPose = { open: 0, round: 0, wide: 0 };
  character.update(1 / 60);
  assert.equal(faceMesh.morphTargetInfluences[0], 0, "M/B/P and pauses must close the jaw without smoothing lag");
  character.endSentence();
  for (let i = 0; i < 60; i++) character.update(1 / 60);
  assert.equal(character.speaking, false);
  assert.equal(character.mode, "idle");
  assert(faceMesh.morphTargetInfluences[0] < 0.001, "Ending audio must close the mouth");
  character.faceFocus = true;
  character.walkWait = -1;
  character.beginSentence({ gesture: "explain", mood: "relaxed" });
  const focusedPosition = model.position.clone();
  for (let i = 0; i < 600; i++) character.update(1 / 60);
  assert.equal(character.walking, false, "Face focus must keep the mouth facing the viewer");
  assert(model.position.distanceTo(focusedPosition) < 0.0001);
  assert(Math.abs(model.rotation.y) < 0.001);
  character.endSentence();
});

test("gesture reach and recovery ease in and out without abrupt endpoints", () => {
  assert.equal(gestureEnvelope(0), 0);
  assert.equal(gestureEnvelope(1), 0);
  assert.equal(gestureEnvelope(0.5), 1);
  assert(gestureEnvelope(0.001) < 0.00001);
  assert(gestureEnvelope(0.999) < 0.00001);
});

test("blink closes briefly and reopens smoothly", () => {
  assert.equal(blinkEnvelope(-1), 0);
  assert.equal(blinkEnvelope(0), 0);
  assert.equal(blinkEnvelope(0.1), 1);
  assert.equal(blinkEnvelope(0.3), 0);
  assert(blinkEnvelope(0.04) > 0 && blinkEnvelope(0.04) < 1);
  assert(blinkEnvelope(0.19) > 0 && blinkEnvelope(0.19) < 1);
});
