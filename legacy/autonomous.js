import * as THREE from "three";
import { GestureDirector } from "./gestures.js";
import { blinkEnvelope } from "./expressions.js";

const moods = {
  happy: { speed: 1, strength: 0.8, pitch: -0.025, tilt: 0.025 },
  joyful: { speed: 1.15, strength: 1, pitch: -0.055, tilt: 0.04 },
  sad: { speed: 0.72, strength: 0.85, pitch: 0.12, tilt: -0.055 },
  angry: { speed: 1.06, strength: 0.9, pitch: 0.045, tilt: 0 },
  relaxed: { speed: 0.86, strength: 0, pitch: 0, tilt: 0.02 },
};

export class AutonomousCharacter {
  constructor(model, mesh, clips, random = Math.random) {
    this.model = model;
    this.mesh = mesh;
    this.random = random;
    this.time = 0;
    this.mood = "happy";
    this.moodQueue = [];
    this.moodLeft = 5;
    this.behaviorLeft = 4;
    this.speaking = true;
    this.gestureStrength = 0.7;
    this.syllableLeft = 0.1;
    this.syllableDuration = 0.2;
    this.syllableTime = 0;
    this.opening = 0;
    this.rounding = 0;
    this.phraseLeft = 2.5;
    this.phrasePause = 0;
    this.blinkWait = this.between(2.3, 4.2);
    this.blinkTime = -1;
    this.walkWait = 7;
    this.walking = false;
    this.faceFocus = false;
    this.walkBlend = 0;
    this.walkPhase = 0;
    this.walkSpeed = 0;
    this.goal = new THREE.Vector3();
    this.direction = new THREE.Vector3(0, 0, 1);
    this.rotation = new THREE.Quaternion();
    this.parentRotation = new THREE.Quaternion();
    this.vector = new THREE.Vector3();
    this.worldRotation = new THREE.Quaternion();
    this.rig = {};
    model.updateMatrixWorld(true);
    const inverseModel = model.getWorldQuaternion(new THREE.Quaternion()).invert();
    model.traverse((bone) => {
      if (!bone.isBone) return;
      this.rig[bone.name.replace(/^mixamorig\d*:?/i, "")] = {
        bone,
        bindQuaternion: bone.quaternion.clone(),
        animatedPosition: bone.position.clone(),
        animatedQuaternion: bone.quaternion.clone(),
        local: model.worldToLocal(bone.getWorldPosition(new THREE.Vector3())),
        world: bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(inverseModel),
      };
    });
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    // Speech is driven live below, so no six-second facial loop is retained.
    for (const mode of ["idle", "talk", "wave"]) {
      const clip = clips[mode].clone();
      clip.tracks = clip.tracks.filter((track) => !track.name.includes("morphTargetInfluences"));
      this.actions[mode] = this.mixer.clipAction(clip).setEffectiveWeight(0).play();
    }
    this.actions.talk.setEffectiveWeight(1);
    this.weights = { idle: 0, talk: 1, wave: 0 };
    this.mode = "talk";
    this.gestures = new GestureDirector(this);
    this.motionSpeed = moods.happy.speed;
    this.tilt = moods.happy.tilt;
  }

  between(min, max) { return min + this.random() * (max - min); }

  setPresenterMode() {
    this.speechDriven = true;
    this.endSentence();
    this.weights = { idle: 1, talk: 0, wave: 0 };
    for (const [name, action] of Object.entries(this.actions)) action.setEffectiveWeight(name === "idle" ? 1 : 0);
  }

  beginSentence(cue) {
    this.speechActive = true;
    this.mode = "talk";
    this.speaking = true;
    this.mood = cue.mood || "happy";
    this.phrasePause = 0;
    this.syllableLeft = 0;
    this.gestures.scriptCue = cue;
    this.gestures.name = cue.gesture;
    this.gestures.elapsed = 0;
    this.gestures.duration = 5.5;
  }

  speechBoundary({ text, charIndex, name }) {
    if (this.speechDriven) return; // Presenter lips are sampled from the audio clock.
    if (!this.speechActive || name === "sentence" || !Number.isFinite(charIndex)) return;
    const word = text.slice(charIndex).match(/^\S+/)?.[0] || "";
    this.syllableTime = 0;
    this.syllableDuration = THREE.MathUtils.clamp(word.length * 0.035, 0.15, 0.35);
    this.syllableLeft = this.syllableDuration;
    this.opening = /[ao]/i.test(word) ? 0.7 : 0.48;
    this.rounding = /[ou]/i.test(word) ? 0.55 : 0.15;
  }

  endSentence() {
    this.speechActive = false;
    this.mouthPose = null;
    this.mode = "idle";
    this.speaking = false;
    this.walking = false;
    this.walkWait = 7;
    this.gestures.scriptCue = null;
    this.mood = "relaxed";
  }

  changeMood() {
    if (!this.moodQueue.length) {
      this.moodQueue = Object.keys(moods).filter((name) => name !== this.mood);
      for (let i = this.moodQueue.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.moodQueue[i], this.moodQueue[j]] = [this.moodQueue[j], this.moodQueue[i]];
      }
    }
    this.mood = this.moodQueue.pop();
    this.moodLeft = this.between(5.5, 9);
  }

  update(delta) {
    if (delta <= 0) return;
    this.time += delta;
    this.moodLeft -= delta;
    if (!this.speechDriven && this.moodLeft <= 0) this.changeMood();
    const mood = moods[this.mood];
    const blend = 1 - Math.exp(-delta * 4);
    this.motionSpeed = THREE.MathUtils.lerp(this.motionSpeed, mood.speed, 1 - Math.exp(-delta * 2));
    this.behaviorLeft -= delta;
    if (!this.speechDriven && this.behaviorLeft <= 0) {
      this.mode = this.random() < 0.76 ? "talk" : "idle";
      if (!this.walking && this.mood === "joyful" && this.random() < 0.35) this.mode = "wave";
      this.behaviorLeft = this.mode === "talk" ? this.between(4, 7) : this.between(1.5, 2.8);
      this.gestureStrength = this.between(0.45, 0.95);
    }
    if (this.speechDriven) this.mode = this.speechActive ? "talk" : "idle";
    this.speaking = this.mode === "talk";
    const gesture = this.mood === "sad" ? 0.3 : this.gestureStrength;
    for (const [name, action] of Object.entries(this.actions)) {
      const target = name === this.mode ? (name === "talk" ? gesture : 1) : name === "idle" && this.mode === "talk" ? 1 - gesture : 0;
      this.weights[name] = THREE.MathUtils.lerp(this.weights[name], target, blend);
      action.setEffectiveWeight(this.weights[name]);
      const speed = this.motionSpeed * (name === "talk" ? 0.83 + this.gestureStrength * 0.22 : 1);
      action.setEffectiveTimeScale(THREE.MathUtils.lerp(action.getEffectiveTimeScale(), speed, blend));
    }
    // Restore the last mixer pose before adding procedural offsets. Three.js
    // can skip rewriting constant tracks; otherwise those offsets accumulate.
    for (const entry of Object.values(this.rig)) {
      entry.bone.position.copy(entry.animatedPosition);
      entry.bone.quaternion.copy(entry.animatedQuaternion);
    }
    this.mixer.update(delta);
    for (const entry of Object.values(this.rig)) {
      entry.animatedPosition.copy(entry.bone.position);
      entry.animatedQuaternion.copy(entry.bone.quaternion);
    }
    this.updateWalking(delta, blend);
    this.addPosture(delta, mood);
    this.gestures.update(delta);
    this.updateFace(delta, mood, blend);
    this.model.updateMatrixWorld(true);
  }

  addPosture(delta, mood) {
    this.pitch = THREE.MathUtils.lerp(this.pitch ?? 0, mood.pitch, 1 - Math.exp(-delta * 2));
    this.tilt = THREE.MathUtils.lerp(this.tilt, mood.tilt, 1 - Math.exp(-delta * 2));
    const head = this.rig.Head.bone;
    // Look around gently, and turn back toward the viewer while strolling.
    const yaw = THREE.MathUtils.clamp(-this.model.rotation.y, -0.5, 0.5) * this.walkBlend;
    this.rotation.setFromEuler(new THREE.Euler(this.pitch, yaw + 0.035 * Math.sin(this.time * 0.71), this.tilt));
    head.quaternion.multiply(this.rotation);
    this.rotation.setFromEuler(new THREE.Euler(this.pitch * 0.22, 0.018 * Math.sin(this.time * 0.8), 0.008 * Math.sin(this.time)));
    this.rig.Spine.bone.quaternion.multiply(this.rotation);
  }

  updateFace(delta, mood, blend) {
    if (!this.speechDriven) {
      this.phraseLeft -= delta;
      this.phrasePause = Math.max(0, this.phrasePause - delta);
      if (this.phraseLeft <= 0) {
        this.phrasePause = this.between(0.3, 0.9);
        this.phraseLeft = this.phrasePause + this.between(1.5, 3.8);
      }
      this.syllableLeft -= delta;
      this.syllableTime += delta;
      if (this.syllableLeft <= 0) {
        this.syllableDuration = this.between(0.15, 0.32) / mood.speed;
        this.syllableTime = 0;
        this.syllableLeft = this.syllableDuration + this.between(0.025, 0.11);
        this.opening = this.between(0.3, this.mood === "joyful" ? 0.9 : 0.7);
        this.rounding = this.between(0, 0.65);
      }
    }
    const envelope = this.speaking && this.phrasePause === 0 && this.syllableTime < this.syllableDuration
      ? Math.sin(this.syllableTime / this.syllableDuration * Math.PI) ** 2 : 0;
    const influences = this.mesh.morphTargetInfluences;
    const dictionary = this.mesh.morphTargetDictionary;
    if (this.blinkTime < 0) {
      this.blinkWait -= delta;
      if (this.blinkWait <= 0) this.blinkTime = 0;
    } else {
      this.blinkTime += delta;
      if (this.blinkTime >= 0.26) {
        this.blinkTime = -1;
        this.blinkWait = this.random() < 0.1 ? this.between(0.12, 0.2) : this.between(2.3, 5.5);
      }
    }
    influences[dictionary.blink] = blinkEnvelope(this.blinkTime);
    const pose = this.speechDriven
      ? (this.speechActive && this.mouthPose) || { open: 0, round: 0, wide: 0 }
      : { open: this.opening * envelope, round: this.rounding * envelope, wide: 0 };
    for (const [name, value] of [["SpeechOpen", pose.open], ["SpeechRound", pose.round], ["SpeechWide", pose.wide]]) {
      const i = dictionary[name];
      // Visemes already blend in the timeline; a second smoothing filter would
      // lag behind fast consonants and keep M/B/P from closing the lips.
      influences[i] = this.speechDriven ? THREE.MathUtils.clamp(value, 0, 1)
        : THREE.MathUtils.lerp(influences[i], value, 1 - Math.exp(-delta * 25));
    }
    for (const name of ["happy", "sad", "angry"]) {
      const active = name === this.mood || name === "happy" && this.mood === "joyful";
      // Lip-corner expressions must yield to articulation, especially U/O.
      const articulation = this.speechDriven && this.speechActive ? 0.35 * (1 - pose.round * 0.7) : 1;
      const strength = active ? mood.strength * articulation : 0;
      const i = dictionary[name];
      influences[i] = THREE.MathUtils.lerp(influences[i], strength, blend * 0.55);
    }
  }

  updateWalking(delta, blend) {
    if (this.faceFocus) {
      this.walking = false;
      this.walkWait = 7;
    }
    this.walkWait -= delta;
    if (!this.faceFocus && !this.walking && this.walkWait <= 0 && (!this.speechDriven || this.speechActive)) {
      // A small bounded stage keeps the character visible, including on mobile.
      const x = this.model.position.x > 0 ? this.between(-0.65, -0.25) : this.between(0.25, 0.65);
      this.goal.set(x, 0, this.between(-0.3, 0.25));
      this.walking = true;
    }
    const remaining = this.goal.clone().sub(this.model.position);
    remaining.y = 0;
    const distance = remaining.length();
    const speedTarget = this.walking ? Math.min(0.23, distance * 1.8) : 0;
    this.walkSpeed = THREE.MathUtils.lerp(this.walkSpeed, speedTarget, blend);
    if (this.walking && distance > 0.005) this.direction.copy(remaining).normalize();
    const travel = Math.min(distance, this.walkSpeed * delta);
    if (this.walking) {
      this.model.position.addScaledVector(this.direction, travel);
      this.walkPhase += travel / 0.48 * Math.PI * 2;
      if (distance < 0.025) {
        this.walking = false;
        this.walkWait = this.between(6, 11);
      }
    }
    this.walkBlend = THREE.MathUtils.lerp(this.walkBlend, this.walking ? 1 : 0, blend);
    const facing = this.walking ? Math.atan2(this.direction.x, this.direction.z) : 0;
    const yawDifference = Math.atan2(Math.sin(facing - this.model.rotation.y), Math.cos(facing - this.model.rotation.y));
    this.model.rotation.y += yawDifference * (1 - Math.exp(-delta * 3));
    const hips = this.rig.Hips.bone;
    hips.position.y -= this.walkBlend * (1.4 + 0.55 * (1 - Math.cos(this.walkPhase * 2)));
    this.model.updateMatrixWorld(true);
    this.model.getWorldQuaternion(this.worldRotation);
    for (const [side, offset] of [["Left", 0], ["Right", Math.PI]]) {
      const cycle = ((this.walkPhase + offset) / (Math.PI * 2)) % 1;
      const stance = cycle < 0.5;
      const swing = (cycle - 0.5) * 2;
      // Match horizontal velocity at toe-off and landing; ease vertical lift.
      const stride = stance ? 12 - 48 * cycle : -12 - 24 * swing + 144 * swing ** 2 - 96 * swing ** 3;
      const lift = stance ? 0 : 5 * Math.sin(swing * Math.PI) ** 2;
      const foot = this.rig[`${side}Foot`];
      const target = foot.local.clone();
      target.z += stride * this.walkBlend;
      target.y += lift * this.walkBlend;
      this.solveLeg(side, target);
    }
  }

  aimBone(entry, localDirection) {
    const restDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(entry.world);
    this.rotation.setFromUnitVectors(restDirection, localDirection.clone().normalize()).multiply(entry.world).premultiply(this.worldRotation);
    entry.bone.parent.getWorldQuaternion(this.parentRotation).invert();
    entry.bone.quaternion.copy(this.parentRotation).multiply(this.rotation);
    entry.bone.updateMatrixWorld(true);
  }

  solveLeg(side, target) {
    const upper = this.rig[`${side}UpLeg`], lower = this.rig[`${side}Leg`], foot = this.rig[`${side}Foot`];
    const hip = this.model.worldToLocal(upper.bone.getWorldPosition(new THREE.Vector3()));
    const first = upper.local.distanceTo(lower.local), second = lower.local.distanceTo(foot.local);
    const direction = target.clone().sub(hip);
    const distance = Math.min(direction.length(), first + second - 0.01);
    direction.normalize();
    const along = (first * first - second * second + distance * distance) / (2 * distance);
    const bend = Math.sqrt(Math.max(0, first * first - along * along));
    const pole = new THREE.Vector3(0, 0, 1).addScaledVector(direction, -direction.z).normalize();
    const knee = hip.clone().addScaledVector(direction, along).addScaledVector(pole, bend);
    this.aimBone(upper, knee.clone().sub(hip));
    this.aimBone(lower, target.clone().sub(knee));
    foot.bone.parent.getWorldQuaternion(this.parentRotation).invert();
    foot.bone.quaternion.copy(this.parentRotation).multiply(this.worldRotation).multiply(foot.world);
    foot.bone.updateMatrixWorld(true);
  }
}
