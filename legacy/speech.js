import * as THREE from "three";

// Hand-authored syllable rhythm for the six-second talk loop, with phrase pauses.
// This is a silent speaking gesture, not audio-driven lip sync.
const syllables = [
  [0.12, 0.34, 0.65, 0.1], [0.39, 0.65, 0.9, 0.2],
  [0.72, 0.91, 0.5, 0.75], [0.98, 1.3, 0.8, 0.4],
  [1.4, 1.62, 0.55, 0.1], [1.69, 1.99, 0.95, 0.6],
  [2.35, 2.58, 0.65, 0.15], [2.65, 2.96, 0.85, 0.8],
  [3.02, 3.23, 0.5, 0.15], [3.29, 3.58, 0.8, 0.35],
  [3.64, 3.88, 0.6, 0.65], [4.27, 4.58, 0.95, 0.15],
  [4.64, 4.85, 0.6, 0.7], [4.94, 5.21, 0.85, 0.2],
  [5.3, 5.6, 0.65, 0.5],
];

export function speechPose(time) {
  const phase = ((time % 6) + 6) % 6;
  for (const [start, end, openness, roundness] of syllables) {
    if (phase < start || phase > end) continue;
    const envelope = Math.sin((phase - start) / (end - start) * Math.PI) ** 2;
    return [openness * envelope, roundness * envelope];
  }
  return [0, 0];
}

export function addSpeechAnimation(model, clips) {
  let mesh;
  model.traverse((node) => {
    if (node.isSkinnedMesh && node.name === "Ch06") mesh = node;
  });
  // These landmarks are authored for the supplied Ch06 model in FBX centimeters.
  // A different character needs its own facial rig or calibrated landmarks.
  if (!mesh) throw new Error("Gerakan mulut memerlukan model Ch06 yang disertakan.");
  const geometry = mesh.geometry;
  if (geometry.morphAttributes.position?.length) throw new Error("Model sudah memiliki morph wajah.");
  const headIndex = mesh.skeleton.bones.findIndex((bone) => /Head$/.test(bone.name));
  if (headIndex < 0) throw new Error("Tulang kepala tidak ditemukan.");
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const indices = geometry.attributes.skinIndex;
  const weights = geometry.attributes.skinWeight;
  const open = positions.clone();
  const round = positions.clone();
  const wide = positions.clone();
  const openNormals = normals.clone();
  const roundNormals = normals.clone();
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const pivot = new THREE.Vector3(0, 163, 3);
  const axis = new THREE.Vector3(1, 0, 0);
  const smooth = THREE.MathUtils.smoothstep;

  for (let i = 0; i < positions.count; i++) {
    let headWeight = 0;
    for (let j = 0; j < 4; j++) {
      if (indices.getComponent(i, j) === headIndex) headWeight += weights.getComponent(i, j);
    }
    if (headWeight < 0.5) continue;
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const face = (1 - smooth(Math.abs(x), 3.2, 6.3)) * smooth(z, 3.5, 10) * headWeight;
    // Keep the upper lip fixed and taper the opening at the mouth corners.
    // The two inner lip loops meet at y=162.700 and y=162.734 in this mesh.
    const corner = 1 - smooth(Math.abs(x), 1.4, 3.9) * smooth(y, 159.5, 161.5);
    const jaw = face * corner * smooth(y, 154.5, 158) * (1 - smooth(y, 162.705, 162.727));
    if (jaw > 0) {
      const angle = 0.18 * jaw;
      vertex.fromBufferAttribute(positions, i).sub(pivot).applyAxisAngle(axis, angle).add(pivot);
      open.setXYZ(i, vertex.x, vertex.y, vertex.z);
      normal.fromBufferAttribute(normals, i).applyAxisAngle(axis, angle);
      openNormals.setXYZ(i, normal.x, normal.y, normal.z);
    }
    const lips = face * smooth(y, 160, 161.4) * (1 - smooth(y, 163.8, 164.7)) * smooth(z, 10.5, 12.4);
    if (lips > 0) round.setXYZ(i, x * (1 - 0.3 * lips), y, z + 0.5 * lips);
    if (lips > 0) wide.setXYZ(i, x * (1 + 0.23 * lips), y, z - 0.08 * lips);
  }
  open.name = "SpeechOpen";
  round.name = "SpeechRound";
  wide.name = "SpeechWide";
  geometry.morphTargetsRelative = false;
  geometry.morphAttributes.position = [open, round, wide];
  geometry.morphAttributes.normal = [openNormals, roundNormals, normals.clone()];
  mesh.updateMorphTargets();

  for (const [mode, clip] of Object.entries(clips)) {
    const times = [], openValues = [], roundValues = [];
    const frames = mode === "talk" ? Math.round(clip.duration * 60) : 1;
    for (let frame = 0; frame <= frames; frame++) {
      const time = frame / frames * clip.duration;
      const [opening, rounding] = mode === "talk" ? speechPose(time) : [0, 0];
      times.push(time);
      openValues.push(opening);
      roundValues.push(rounding);
    }
    clip.tracks.push(
      new THREE.NumberKeyframeTrack(`${mesh.name}.morphTargetInfluences[0]`, times, openValues),
      new THREE.NumberKeyframeTrack(`${mesh.name}.morphTargetInfluences[1]`, times, roundValues),
    );
  }
  return mesh;
}
