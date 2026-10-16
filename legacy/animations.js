import * as THREE from "three";

// Sample new skeletal clips from the bind pose, independently of the FBX dance.
export function createGestureClips(model) {
  model.traverse((node) => { if (node.isSkinnedMesh) node.skeleton.pose(); });
  model.updateMatrixWorld(true);
  const bones = [];
  const rig = {};
  model.traverse((bone) => {
    if (!bone.isBone) return;
    const entry = { bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), worldQuaternion: bone.getWorldQuaternion(new THREE.Quaternion()) };
    bones.push(entry);
    rig[bone.name.replace(/^mixamorig\d*:?/i, "")] = entry;
  });
  for (const name of ["Hips", "Spine", "Spine2", "Head", "LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand"]) {
    if (!rig[name]) throw new Error(`Model tidak memiliki tulang ${name}.`);
  }
  const up = new THREE.Vector3(0, 1, 0);
  const parentRotation = new THREE.Quaternion();
  const rotation = new THREE.Quaternion();
  const direction = new THREE.Vector3();

  function resetPose() {
    for (const entry of bones) {
      entry.bone.position.copy(entry.position);
      entry.bone.quaternion.copy(entry.quaternion);
    }
    model.updateMatrixWorld(true);
  }
  function turn(name, x, y, z) {
    const entry = rig[name];
    rotation.setFromEuler(new THREE.Euler(x, y, z));
    entry.bone.quaternion.copy(entry.quaternion).multiply(rotation);
    entry.bone.updateMatrixWorld(true);
  }
  function setWorldRotation(entry, worldRotation) {
    entry.bone.parent.getWorldQuaternion(parentRotation).invert();
    entry.bone.quaternion.copy(parentRotation).multiply(worldRotation);
    entry.bone.updateMatrixWorld(true);
  }
  // Preserve bind-pose roll while aiming the bone's length axis in world space.
  function aim(name, x, y, z) {
    const entry = rig[name];
    direction.set(x, y, z).normalize();
    const restDirection = up.clone().applyQuaternion(entry.worldQuaternion);
    rotation.setFromUnitVectors(restDirection, direction).multiply(entry.worldQuaternion);
    setWorldRotation(entry, rotation);
  }
  function palm(name, fingerDirection, palmNormal) {
    const y = new THREE.Vector3(...fingerDirection).normalize();
    const palmSign = Math.sign(new THREE.Vector3(0, -1, 0).applyQuaternion(rig[name].worldQuaternion.clone().invert()).z);
    const x = y.clone().cross(new THREE.Vector3(...palmNormal).multiplyScalar(palmSign)).normalize();
    const z = x.clone().cross(y).normalize();
    rotation.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    setWorldRotation(rig[name], rotation);
  }
  function pose(mode, time, duration) {
    resetPose();
    const phase = time / duration * Math.PI * 2;
    const breathe = Math.sin(phase);
    turn("Spine", 0.012 * breathe, 0, 0);
    turn("Spine2", 0, 0.015 * breathe, 0.012 * breathe);
    for (const [side, sign] of [["Left", 1], ["Right", -1]]) {
      aim(`${side}Arm`, sign * 0.22, -1, 0.05);
      aim(`${side}ForeArm`, sign * 0.12, -1, 0.18);
      aim(`${side}Hand`, sign * 0.1, -1, 0.13);
    }
    if (mode === "wave") {
      const wave = Math.sin(phase * 3);
      turn("Head", 0.025 * Math.sin(phase * 2), -0.06, -0.055);
      aim("RightArm", -0.95, 0.12, 0.1);
      aim("RightForeArm", -0.18 + 0.34 * wave, 1, 0.18);
      palm("RightHand", [-0.18 + 0.6 * wave, 1, 0.08], [0, 0, 1]);
    }
    if (mode === "talk") {
      const beat = Math.sin(phase * 3);
      const reply = Math.sin(phase * 2 + 0.8);
      turn("Spine2", 0.018 * breathe, 0.045 * breathe, 0.015 * reply);
      turn("Head", 0.045 * beat, 0.09 * Math.sin(phase), 0.025 * reply);
      aim("RightArm", -0.38, -0.88, 0.18);
      aim("RightForeArm", -0.25 - 0.18 * beat, 0.24 + 0.22 * beat, 0.9);
      palm("RightHand", [-0.2, 0.12 + 0.18 * beat, 1], [0, 1, 0.15]);
      aim("LeftArm", 0.32, -0.92, 0.14);
      aim("LeftForeArm", 0.25 + 0.16 * reply, 0.05 + 0.2 * reply, 0.9);
      palm("LeftHand", [0.25, 0.08 + 0.16 * reply, 1], [0, 1, 0.15]);
    }
  }
  function sample(mode, duration) {
    const times = [];
    const values = bones.map(() => []);
    for (let frame = 0; frame <= duration * 30; frame++) {
      const time = frame / 30;
      times.push(time);
      pose(mode, time, duration);
      bones.forEach(({ bone }, index) => {
        const previous = values[index];
        const q = bone.quaternion;
        const offset = previous.length - 4;
        // Adjacent samples must stay in the same quaternion hemisphere.
        const sign = offset >= 0 && q.x * previous[offset] + q.y * previous[offset + 1] + q.z * previous[offset + 2] + q.w * previous[offset + 3] < 0 ? -1 : 1;
        previous.push(q.x * sign, q.y * sign, q.z * sign, q.w * sign);
      });
    }
    const tracks = bones.map(({ bone }, index) => new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values[index]));
    // Restore the standing root position when transitioning away from the dance.
    tracks.push(new THREE.VectorKeyframeTrack(`${rig.Hips.bone.name}.position`, [0, duration], [...rig.Hips.position.toArray(), ...rig.Hips.position.toArray()]));
    return new THREE.AnimationClip(mode, duration, tracks);
  }
  const clips = { idle: sample("idle", 4), wave: sample("wave", 4), talk: sample("talk", 6) };
  resetPose();
  return clips;
}
