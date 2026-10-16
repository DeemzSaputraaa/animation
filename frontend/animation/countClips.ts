import * as THREE from 'three';

export const countNumber = (name: string) => {
  const match = /^gesture_count_([1-9]|10)$/.exec(name);
  return match ? Number(match[1]) : 0;
};

// Fit the fingers in each character's own hand space. Copying the old thumb
// rotations onto Harry pushed its longer segments through the folded fingers.
export function prepareCountClips(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
  const bones = new Map<string, THREE.Bone>();
  model.traverse(node => { if ((node as THREE.Bone).isBone) bones.set(node.name.replace(/^mixamorig\d*:?/, ''), node as THREE.Bone); });
  const bone = (name: string) => {
    const result = bones.get(name);
    if (!result) throw new Error(`Tulang hitungan tidak tersedia: ${name}`);
    return result;
  };
  const held = clips.find(clip => clip.name === 'gesture_count_1');
  const idle = clips.find(clip => clip.name === 'idle_neutral');
  if (!held || !idle) throw new Error('Pose dasar hitungan tidak tersedia.');
  const sample = (clip: THREE.AnimationClip, name: string) => {
    const track = clip.tracks.find(track => track.name === `${bone(name).name}.quaternion`);
    if (!track) throw new Error(`Track hitungan tidak tersedia: ${name}`);
    // The count pose is constant; the idle's first quaternion is its relaxed pose.
    return new THREE.Quaternion().fromArray(track.values, 0).normalize();
  };
  const track = (name: string, rotation: THREE.Quaternion) => new THREE.QuaternionKeyframeTrack(
    `${bone(name).name}.quaternion`, [0, 1], [...rotation.toArray(), ...rotation.toArray()],
  );
  const hands = new Map<string, { open: THREE.KeyframeTrack[]; closed: THREE.KeyframeTrack[] }[]>();
  for (const [side, sign] of [['Right', 1], ['Left', -1]] as const) {
    const width = Math.abs(bone(`${side}HandIndex1`).position.x - bone(`${side}HandPinky1`).position.x);
    const length = bone(`${side}HandMiddle1`).position.y;
    hands.set(side, ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'].map((digit, index) => {
      const poses = [true, false].map(open => {
        const tracks: THREE.KeyframeTrack[] = [];
        const parent = new THREE.Quaternion(), restParent = new THREE.Quaternion();
        const position = bone(`${side}Hand${digit}1`).position.clone();
        // Fold the thumb over the OUTSIDE of the curled fingers. Keep its tip
        // on the index/middle side instead of burying it toward the ring finger.
        const thumbTargets = [[.65, .57, .50], [.55, .80, .78], [.22, .93, .90]];
        for (let joint = 1; joint <= 3; joint++) {
          const name = `${side}Hand${digit}${joint}`;
          const current = bone(name), next = bone(`${side}Hand${digit}${joint + 1}`);
          const rest = restParent.clone().multiply(current.quaternion);
          let direction: THREE.Vector3;
          if (digit === 'Thumb') {
            const [x, y, z] = thumbTargets[joint - 1];
            direction = open
              ? new THREE.Vector3(sign * (.82 - joint * .09), .54 + joint * .09, .12)
              : new THREE.Vector3(sign * x * width, y * length, z * width).sub(position);
          } else {
            const angle = open ? .02 : [.85, 1.95, 2.7][joint - 1];
            direction = new THREE.Vector3(sign * [.09, .015, -.045, -.12][index], Math.cos(angle), Math.sin(angle));
          }
          direction.normalize();
          const restDirection = next.position.clone().normalize().applyQuaternion(rest);
          const absolute = new THREE.Quaternion().setFromUnitVectors(restDirection, direction).multiply(rest).normalize();
          tracks.push(track(name, parent.clone().invert().multiply(absolute).normalize()));
          parent.copy(absolute); restParent.copy(rest);
          position.add(next.position.clone().applyQuaternion(parent));
        }
        return tracks;
      });
      return { open: poses[0], closed: poses[1] };
    }));
  }
  const counts = Array.from({ length: 10 }, (_, index) => {
    const count = index + 1;
    const tracks: THREE.KeyframeTrack[] = [];
    for (const side of ['Right', 'Left']) {
      const raised = side === 'Right' || count > 5;
      for (const part of ['Shoulder', 'Arm', 'ForeArm', 'Hand']) {
        const rotation = raised ? sample(held, `Right${part}`) : sample(idle, `${side}${part}`);
        if (side === 'Left' && raised) rotation.set(rotation.x, -rotation.y, -rotation.z, rotation.w);
        tracks.push(track(`${side}${part}`, rotation));
      }
      const fingers = side === 'Right' ? Math.min(count, 5) : Math.max(count - 5, 0);
      hands.get(side)!.forEach((poses, digit) => {
        // Keep the unused left hand in the existing relaxed idle pose.
        if (!raised) for (const source of poses.open) {
          const name = source.name.slice(0, -'.quaternion'.length).replace(/^mixamorig\d*:?/, '');
          tracks.push(track(name, sample(idle, name)));
        }
        else tracks.push(...(digit < fingers ? poses.open : poses.closed).map(track => track.clone()));
      });
    }
    return new THREE.AnimationClip(`gesture_count_${count}`, 1, tracks);
  });
  return [...clips.filter(clip => !countNumber(clip.name)), ...counts];
}
