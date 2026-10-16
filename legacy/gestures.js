import * as THREE from "three";

const smooth = (t) => THREE.MathUtils.smootherstep(t, 0, 1);
const down = new THREE.Vector3(0, -1, 0);

export function gestureEnvelope(progress) {
  // Prepare, reach, hold, then recover with zero velocity at both ends.
  return smooth(progress / 0.23) * (1 - smooth((progress - 0.7) / 0.3));
}

export const gestureNames = ["pointRight", "pointLeft", "pointUp", "explain", "self", "shrug", "emphasize", "celebrate"];
const choices = {
  happy: ["pointRight", "explain", "pointLeft", "self", "shrug"],
  joyful: ["celebrate", "pointUp", "explain", "pointLeft"],
  sad: ["self", "shrug", "explain"],
  angry: ["emphasize", "pointRight", "pointUp"],
  relaxed: ["explain", "self", "pointLeft", "pointRight"],
};

export class GestureDirector {
  constructor(character) {
    this.character = character;
    this.name = "pointRight";
    this.elapsed = -0.6;
    this.duration = 4.8;
    this.amount = 0;
    this.previous = "";
    this.liftPhase = 0;
    this.liftStrength = 0;
    this.filtered = new Map();
    this.flexAxes = new Map();
    this.rotation = new THREE.Quaternion();
    this.armStates = {};
    this.armTargets = {};
    for (const side of ["Right", "Left"]) {
      const upper = character.rig[`${side}Arm`], lower = character.rig[`${side}ForeArm`], hand = character.rig[`${side}Hand`];
      const y = lower.local.clone().sub(upper.local).normalize();
      const normal = y.clone().cross(hand.local.clone().sub(lower.local).normalize()).normalize();
      const restFrame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(normal, y, normal.clone().cross(y)));
      this.armStates[side] = { restFrameInverse: restFrame.invert(), wrist: null, roll: 0 };
    }
    for (const [name, entry] of Object.entries(character.rig)) {
      if (!/Hand(?:Thumb|Index|Middle|Ring|Pinky)[123]$/.test(name)) continue;
      const palm = down.clone().applyQuaternion(entry.world.clone().invert());
      this.flexAxes.set(name, new THREE.Vector3(0, 1, 0).cross(palm).normalize());
    }
  }

  update(delta) {
    const c = this.character;
    this.elapsed += delta;
    if (this.elapsed > this.duration) {
      this.previous = this.name;
      const pool = this.scriptCue ? [this.scriptCue.gesture, "explain"] : choices[c.mood].filter((name) => name !== this.previous);
      this.name = pool[Math.floor(c.random() * pool.length)];
      this.duration = c.between(4.8, 6.4) * (c.mood === "sad" ? 1.15 : 1);
      this.elapsed = -c.between(0.8, 1.5);
    }
    const progress = Math.max(0, this.elapsed / this.duration);
    const requested = c.speaking ? 1 : 0;
    this.activity = THREE.MathUtils.lerp(this.activity ?? 1, requested, 1 - Math.exp(-delta * 3));
    this.amount = gestureEnvelope(progress) * this.activity * (1 - c.walkBlend * 0.45);
    const amount = this.amount;
    const beat = Math.sin(progress * Math.PI * 4);
    const rhythm = c.syllableDuration ? Math.sin(Math.min(1, c.syllableTime / c.syllableDuration) * Math.PI) : 0;
    const pulse = 0.85 * beat + 0.15 * rhythm;
    c.model.updateMatrixWorld(true);
    c.model.getWorldQuaternion(c.worldRotation);
    for (const [side, sign] of [["Right", -1], ["Left", 1]]) {
      const talk = c.weights.talk * (1 - c.walkBlend * 0.6);
      this.armTargets[side] = {
        wrist: new THREE.Vector3(sign * (29 + 4 * talk), 106 + 16 * talk, 6 + 20 * talk),
        fingers: new THREE.Vector3(sign * 0.1, -1 + 0.8 * talk, 0.12 + 0.8 * talk).normalize(),
        palm: new THREE.Vector3(-sign, 0.55 * talk, 0.3).normalize(),
        shape: "relax", amount: 1,
      };
    }

    if (amount > 0.0001) {
      // Targets are relative to the character, in the FBX's centimeter units.
      // Palm normals refer to the anatomical palm, including the mirrored hand.
      if (this.name === "welcome") {
        this.arm("Right", [-42, 158 + pulse, 20], [-0.15, 1, 0.1], [0, 0, 1], "open", amount);
      } else if (this.name === "count") {
        this.arm("Right", [-36, 155 + pulse, 25], [0, 1, 0.12], [0, 0, 1], `count${this.scriptCue?.count || 3}`, amount);
      } else if (this.name === "pointRight") {
        this.arm("Right", [-61, 147 + 1.3 * pulse, 24], [-0.92, 0.1, 0.4], [0, -1, 0], "point", amount);
        this.arm("Left", [27, 113, 17], [0.1, -0.6, 0.7], [0, 0, 1], "relax", amount * 0.65);
      } else if (this.name === "pointLeft") {
        this.arm("Left", [61, 148 + pulse, 23], [0.9, 0.12, 0.42], [0, -1, 0], "point", amount);
        this.arm("Right", [-28, 113, 17], [-0.1, -0.6, 0.7], [0, 0, 1], "relax", amount * 0.65);
      } else if (this.name === "pointUp") {
        this.arm("Right", [-37, 165 + pulse, 26], [-0.12, 0.97, 0.2], [0, 0, 1], "point", amount);
      } else if (this.name === "self") {
        this.arm("Right", [-6, 136 + pulse * 0.4, 18], [0.55, 0.78, -0.1], [0, 0, -1], "open", amount);
        this.arm("Left", [32, 121, 27], [0.25, 0.18, 1], [0, 1, 0], "relax", amount * 0.75);
      } else if (this.name === "emphasize") {
        this.arm("Right", [-25, 139 + pulse * 4, 30], [0.05, 0.65, 0.7], [1, 0, 0], "open", amount);
        this.arm("Left", [30, 123, 27], [0.1, 0.3, 1], [0, 1, 0], "relax", amount * 0.75);
      } else {
        for (const [side, sign] of [["Right", -1], ["Left", 1]]) {
          if (this.name === "celebrate") {
            this.arm(side, [sign * 48, 166 + 2 * pulse, 17], [sign * 0.5, 0.85, 0.1], [0, 0, 1], "open", amount);
          } else if (this.name === "shrug") {
            this.arm(side, [sign * 47, 143 + pulse, 20], [sign * 0.45, 0.25, 0.8], [0, 1, 0], "open", amount);
          } else {
            this.arm(side, [sign * (43 + 3 * beat), 128 + sign * 2 * pulse, 30], [sign * 0.45, 0.2, 0.8], [0, 1, 0], "open", amount);
          }
        }
      }
      const gaze = this.name === "pointRight" ? -0.24 : this.name === "pointLeft" ? 0.24 : 0;
      const nod = this.name === "pointUp" || this.name === "celebrate" ? -0.075 : this.name === "self" ? 0.045 : 0.03 * pulse;
      this.rotation.setFromEuler(new THREE.Euler(nod * amount, gaze * amount, (this.name === "shrug" ? 0.06 : 0.015 * beat) * amount));
      c.rig.Head.bone.quaternion.multiply(this.rotation);
      this.rotation.setFromEuler(new THREE.Euler(-0.025 * amount, gaze * amount * 0.28, -gaze * amount * 0.08));
      c.rig.Spine2.bone.quaternion.multiply(this.rotation);
    }
    this.updateHandLift(delta);
    c.model.updateMatrixWorld(true);
    for (const side of ["Right", "Left"]) this.solveArm(side, delta);
    this.smoothPose(delta);
  }

  updateHandLift(delta) {
    const c = this.character;
    // A continuous, staggered conversational beat moves the whole forearm,
    // while pointing and touching the chest remain more restrained.
    this.liftPhase += delta * 2.5 * c.motionSpeed;
    const moodScale = { happy: 1, joyful: 1.2, sad: 0.45, angry: 1.1, relaxed: 0.7 }[c.mood];
    const phraseScale = c.phrasePause > 0 ? 0.3 : 1;
    const strength = this.activity * moodScale * phraseScale * (1 - c.walkBlend * 0.65);
    this.liftStrength = THREE.MathUtils.lerp(this.liftStrength, strength, 1 - Math.exp(-delta * 3));
    const restraint = { pointRight: 0.28, pointLeft: 0.28, pointUp: 0.25, self: 0.22, celebrate: 0.5, emphasize: 1.15 }[this.name] ?? 1;
    const amplitude = 7.5 * this.liftStrength * THREE.MathUtils.lerp(1, restraint, this.amount);
    for (const [side, phaseOffset] of [["Right", 0], ["Left", 1.25]]) {
      const phase = this.liftPhase + phaseOffset;
      const lift = amplitude * (0.85 * Math.sin(phase) + 0.15 * Math.sin(phase * 0.47));
      this.armTargets[side].wrist.y += lift;
    }
  }

  arm(side, wrist, fingers, palm, shape, amount) {
    // Blend hand destinations rather than unrelated shoulder/elbow rotations.
    // A single arm solver owns the complete arm throughout every transition.
    const target = this.armTargets[side];
    target.wrist.lerp(new THREE.Vector3(...wrist), amount);
    target.fingers.lerp(new THREE.Vector3(...fingers).normalize(), amount).normalize();
    target.palm.lerp(new THREE.Vector3(...palm).normalize(), amount).normalize();
    target.shape = shape;
    target.amount = amount;
  }

  solveArm(side, delta) {
    const c = this.character;
    const upper = c.rig[`${side}Arm`], lower = c.rig[`${side}ForeArm`], hand = c.rig[`${side}Hand`];
    const pose = this.armTargets[side];
    const state = this.armStates[side];
    if (!state.wrist) {
      state.wrist = pose.wrist.clone();
      state.fingers = pose.fingers.clone();
      state.palm = pose.palm.clone();
    }
    const follow = 1 - Math.exp(-delta * 5);
    state.wrist.lerp(pose.wrist, follow);
    state.fingers.lerp(pose.fingers, follow).normalize();
    state.palm.lerp(pose.palm, follow).normalize();
    const shoulder = c.model.worldToLocal(upper.bone.getWorldPosition(new THREE.Vector3()));
    const target = state.wrist.clone();
    const length1 = upper.local.distanceTo(lower.local), length2 = lower.local.distanceTo(hand.local);
    const direction = target.clone().sub(shoulder);
    const distance = THREE.MathUtils.clamp(direction.length(), 14, length1 + length2 - 2);
    direction.normalize();
    target.copy(shoulder).addScaledVector(direction, distance);
    const along = (length1 * length1 - length2 * length2 + distance * distance) / (2 * distance);
    const bend = Math.sqrt(Math.max(0, length1 * length1 - along * along));
    const pole = new THREE.Vector3(side === "Right" ? -0.35 : 0.35, -1, -0.3);
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(pole, bend);
    const upperDirection = elbow.clone().sub(shoulder).normalize();
    const forearmDirection = target.clone().sub(elbow).normalize();
    const hinge = upperDirection.clone().cross(forearmDirection).normalize();
    const frame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(hinge, upperDirection, hinge.clone().cross(upperDirection)));
    const upperRotation = frame.multiply(state.restFrameInverse).multiply(upper.world);
    this.setModelRotation(upper, upperRotation);

    // The elbow bends in one plane. Turning the palm happens in the forearm,
    // within a small range, instead of spinning the wrist to a world-space pose.
    const lowerRotation = upperRotation.clone().multiply(lower.bindQuaternion);
    const neutralDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(lowerRotation);
    lowerRotation.premultiply(new THREE.Quaternion().setFromUnitVectors(neutralDirection, forearmDirection));
    const neutralHand = lowerRotation.clone().multiply(hand.bindQuaternion);
    const neutralPalm = down.clone().applyQuaternion(hand.world.clone().invert()).applyQuaternion(neutralHand);
    neutralPalm.addScaledVector(forearmDirection, -neutralPalm.dot(forearmDirection)).normalize();
    const wantedPalm = state.palm.clone().addScaledVector(forearmDirection, -state.palm.dot(forearmDirection));
    if (wantedPalm.lengthSq() > 0.001) {
      wantedPalm.normalize();
      let roll = Math.atan2(forearmDirection.dot(neutralPalm.clone().cross(wantedPalm)), neutralPalm.dot(wantedPalm));
      // Stay on the same side of the atan2 seam; never reverse by a full turn.
      if (roll - state.roll > Math.PI) roll -= Math.PI * 2;
      if (roll - state.roll < -Math.PI) roll += Math.PI * 2;
      roll = THREE.MathUtils.clamp(roll, -Math.PI / 3, Math.PI / 3);
      state.roll += THREE.MathUtils.clamp((roll - state.roll) * follow, -delta * 1.2, delta * 1.2);
    }
    lowerRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(forearmDirection, state.roll));
    this.setModelRotation(lower, lowerRotation);
    const alignedHand = lowerRotation.clone().multiply(hand.bindQuaternion);
    const neutralFingers = new THREE.Vector3(0, 1, 0).applyQuaternion(alignedHand);
    const wristBend = new THREE.Quaternion().setFromUnitVectors(neutralFingers, state.fingers);
    const bendAngle = new THREE.Quaternion().angleTo(wristBend);
    if (bendAngle > 0.38) wristBend.slerpQuaternions(new THREE.Quaternion(), wristBend.clone(), 0.38 / bendAngle);
    this.setModelRotation(hand, alignedHand.premultiply(wristBend));
    this.fingers(side, "relax", 1);
    this.fingers(side, pose.shape, pose.amount);
  }

  setModelRotation(entry, rotation) {
    entry.bone.parent.getWorldQuaternion(this.character.parentRotation).invert();
    entry.bone.quaternion.copy(this.character.parentRotation).multiply(this.character.worldRotation).multiply(rotation);
    entry.bone.updateMatrixWorld(true);
  }

  fingers(side, shape, amount) {
    for (const digit of ["Thumb", "Index", "Middle", "Ring", "Pinky"]) {
      for (let joint = 1; joint <= 3; joint++) {
        const name = `${side}Hand${digit}${joint}`;
        const entry = this.character.rig[name];
        if (!entry || !this.flexAxes.has(name)) continue;
        let angle = shape === "relax" ? [0.18, 0.24, 0.14][joint - 1] : 0.035;
        if (shape === "point") angle = digit === "Index" ? 0.015 : digit === "Thumb" ? 0.3 : [0.9, 1.2, 0.8][joint - 1];
        if (shape.startsWith("count")) {
          const extended = ["Index", "Middle", "Ring"].slice(0, Number(shape.at(-1)));
          angle = extended.includes(digit) ? 0.015 : digit === "Thumb" ? 0.3 : [0.9, 1.2, 0.8][joint - 1];
        }
        if (digit === "Thumb" && shape !== "point") angle *= 0.4;
        this.rotation.setFromAxisAngle(this.flexAxes.get(name), angle);
        const target = entry.bindQuaternion.clone().multiply(this.rotation);
        entry.bone.quaternion.slerp(target, amount);
      }
    }
  }

  smoothPose(delta) {
    for (const [name, entry] of Object.entries(this.character.rig)) {
      if (!/Arm|Hand|Shoulder|Spine|Neck|Head/.test(name)) continue;
      if (/Arm$|ForeArm$|Hand$/.test(name)) continue; // Already smoothed in hand-target space.
      const target = entry.bone.quaternion;
      if (!this.filtered.has(name)) this.filtered.set(name, target.clone());
      const previous = this.filtered.get(name);
      const finger = /Hand(?:Thumb|Index|Middle|Ring|Pinky)/.test(name);
      const rate = finger ? 12 : /Head|Neck/.test(name) ? 6 : 9;
      const maxSpeed = finger ? 6 : /Head|Neck/.test(name) ? 2.2 : 3.8;
      const angle = previous.angleTo(target);
      const step = Math.min(1 - Math.exp(-rate * delta), maxSpeed * delta / Math.max(angle, 0.00001));
      previous.slerp(target, step);
      target.copy(previous);
    }
  }
}
