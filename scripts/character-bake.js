import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGestureClips } from '../legacy/animations.js';
import { addSpeechAnimation } from '../legacy/speech.js';
import { addExpressions } from '../legacy/expressions.js';
import { AutonomousCharacter } from '../legacy/autonomous.js';

const poses = {
  A: [1, 0, .08], E: [.48, 0, .65], I: [.18, 0, 1], O: [.68, .85, 0], U: [.16, 1, 0],
  MBP: [0, 0, 0], FV: [.07, 0, .2], L: [.28, 0, .25], WQ: [.12, 1, 0], TH: [.22, 0, .4], CH: [.24, .45, .1],
};

function facialRig(mesh) {
  const geometry = mesh.geometry;
  const base = geometry.attributes.position;
  const old = geometry.morphAttributes.position;
  const target = (name, displace) => {
    const data = base.clone();
    data.name = name;
    for (let i = 0; i < base.count; i++) {
      const p = [base.getX(i), base.getY(i), base.getZ(i)];
      data.setXYZ(i, ...displace(p, i));
    }
    return data;
  };
  const targets = Object.entries(poses).map(([name, weights]) => target(`viseme_${name}`, (p, i) => p.map((v, axis) => {
    const moved = weights.reduce((sum, w, j) => sum + w * (old[j].getComponent(i, axis) - v), 0);
    // A very small lip compression differentiates the closed MBP target.
    const press = name === 'MBP' && axis === 1 && p[2] > 11 && Math.abs(p[0]) < 3 && Math.abs(p[1] - 162.72) < .8
      ? (162.72 - p[1]) * .08 : 0;
    return v + moved + press;
  })));
  for (const [name, source, filter] of [
    ['blinkLeft', 6, p => p[0] > 0], ['blinkRight', 6, p => p[0] <= 0],
    ['smile', 3, p => p[1] < 168], ['frown', 4, p => p[1] < 168],
    ['browInnerUp', 4, p => p[1] > 169], ['browDown', 5, p => p[1] > 169],
  ]) targets.push(target(name, (p, i) => filter(p) ? p.map((v, axis) => old[source].getComponent(i, axis)) : p));
  // Separate an alert brow from the concerned inner-brow shape. Source
  // expression deltas mask skin, excluding the cap and eyeballs.
  targets.push(target('browUp', (p, i) => {
    if (p[1] <= 169 || (Math.abs(old[4].getY(i) - p[1]) + Math.abs(old[5].getY(i) - p[1])) < 1e-6) return p;
    const lift = .72 * Math.exp(-(((p[1] - 170.9) / .7) ** 2) - ((Math.abs(p[0]) - 2.6) / 2) ** 2)
      * THREE.MathUtils.smoothstep(p[2], 7, 11) * THREE.MathUtils.smoothstep(p[1], 169.4, 170)
      * (1 - THREE.MathUtils.smoothstep(p[1], 172, 172.6));
    return [p[0], p[1] + lift, p[2]];
  }));
  targets.push(target('cheekRaise', (p, i) => {
    const mask = THREE.MathUtils.smoothstep(p[1], 163.8, 165) * (1 - THREE.MathUtils.smoothstep(p[1], 167.5, 169));
    return p.map((v, axis) => v + (old[3].getComponent(i, axis) - v) * mask);
  }));
  targets.push(target('eyeWide', (p, i) => [p[0], p[1] - (old[6].getY(i) - p[1]) * .35, p[2]]));
  const jaw = old[0].clone(); jaw.name = 'jawOpen'; targets.push(jaw);
  // The source Ch06 contains separate eyeball surfaces inside the face mesh.
  // Bake tiny gaze offsets so runtime eye movement needs no geometry edits.
  for (const [name, axis, angle] of [['eyeLookLeft', 'y', .1], ['eyeLookRight', 'y', -.1], ['eyeLookUp', 'x', -.07], ['eyeLookDown', 'x', .07]]) {
    const euler = new THREE.Euler(); euler[axis] = angle;
    const rotation = new THREE.Quaternion().setFromEuler(euler);
    targets.push(target(name, (p, i) => {
      if (i < 65262 || i >= 69678) return p;
      const center = new THREE.Vector3(Math.sign(p[0]) * 3.2075, 169.8455, 9.25);
      return new THREE.Vector3(...p).sub(center).applyQuaternion(rotation).add(center).toArray();
    }));
  }
  geometry.morphAttributes.position = targets;
  delete geometry.morphAttributes.normal;
  mesh.updateMorphTargets();
  mesh.geometry = mergeVertices(geometry, 1e-4);
  mesh.geometry.morphAttributes.position.forEach((attribute, index) => { attribute.name = targets[index].name; });
  mesh.updateMorphTargets();
}

export async function bake() {
  const manager = new THREE.LoadingManager();
  const texturesReady = new Promise(resolve => { manager.onLoad = resolve; });
  const model = await new FBXLoader(manager).loadAsync('/models/hip-hop-dancing.fbx');
  await texturesReady;
  const original = createGestureClips(model);
  const mesh = addSpeechAnimation(model, original);
  addExpressions(mesh);
  const character = new AutonomousCharacter(model, mesh, original, () => .5);
  character.setPresenterMode();
  character.faceFocus = true;
  const upper = /(?:Spine2|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand)$/;
  const clips = [];
  for (const [name, speed] of [['idle_neutral', 1], ['idle_breathing', .8], ['idle_shift_weight', .9], ['idle_relaxed', .7]]) {
    const clip = original.idle.clone();
    clip.name = name;
    clip.tracks = clip.tracks.filter(track => !track.name.includes('morphTargetInfluences'));
    for (const track of clip.tracks) track.times = Float32Array.from(track.times, t => t / speed);
    clip.resetDuration();
    if (name === 'idle_shift_weight') {
      const hips = clip.tracks.find(track => track.name.endsWith('Hips.position'));
      if (hips) {
        const [x, y, z] = hips.values;
        hips.times = new Float32Array([0, clip.duration / 2, clip.duration]);
        hips.values = new Float32Array([x, y, z, x + .4, y - .15, z, x, y, z]);
      }
    }
    clips.push(clip);
  }
  const recipes = {
    gesture_open_hand: 'welcome', gesture_explain_left: 'pointLeft', gesture_explain_right: 'explain',
    gesture_both_hands: 'explain', gesture_emphasis: 'emphasize', gesture_point: 'pointRight',
    gesture_count: 'count', gesture_question: 'shrug',
    happy: 'explain', serious: 'emphasize', thinking: 'self', confused: 'shrug', excited: 'celebrate', welcoming: 'welcome',
  };
  const entries = Object.values(character.rig).filter(entry => upper.test(entry.bone.name));
  for (const [name, gesture] of Object.entries(recipes)) {
    character.endSentence();
    for (let i = 0; i < 90; i++) character.update(1 / 30);
    character.beginSentence({ gesture, mood: 'relaxed', count: 3 });
    character.gestures.duration = 2.4;
    const values = entries.map(() => []), times = [];
    for (let frame = 0; frame <= 72; frame++) {
      character.update(1 / 30);
      times.push(frame / 30);
      entries.forEach((entry, i) => values[i].push(...entry.bone.quaternion.toArray()));
    }
    let tracks = entries.map((entry, i) => new THREE.QuaternionKeyframeTrack(`${entry.bone.name}.quaternion`, times, values[i]));
    if (name === 'gesture_explain_left') tracks = tracks.filter(track => !/Right/.test(track.name));
    if (name === 'gesture_explain_right') tracks = tracks.filter(track => !/Left/.test(track.name));
    clips.push(new THREE.AnimationClip(name, 2.4, tracks).optimize());
  }
  // Hold one raised-arm pose across a counting sequence. Only the fingers
  // change; the runtime timeline supplies the approach, crossfade and release.
  const countArm = clips.find(clip => clip.name === 'gesture_count').tracks.filter(track => /Right/.test(track.name));
  // Thumb opposition needs a sweep across the palm, not the other fingers'
  // flexion axis (which makes this rig's thumb point down and away).
  // Solve the three thumb segments once in hand space, then bake the pose.
  const palmWidth = character.rig.RightHandIndex1.bone.position.x - character.rig.RightHandPinky1.bone.position.x;
  const palmLength = character.rig.RightHandMiddle1.bone.position.y;
  const thumbTargets = [[.38, .62, .44], [.04, .76, .58], [-.28, .72, .48]];
  const thumbRotations = [];
  const thumbParent = new THREE.Quaternion();
  const thumbPosition = character.rig.RightHandThumb1.bone.position.clone();
  for (let joint = 1; joint <= 3; joint++) {
    const entry = character.rig[`RightHandThumb${joint}`];
    const next = entry.bone.children.find(bone => bone.isBone);
    const [x, y, z] = thumbTargets[joint - 1];
    const direction = new THREE.Vector3(x * palmWidth, y * palmLength, z * palmWidth)
      .sub(thumbPosition).normalize().applyQuaternion(thumbParent.clone().invert());
    const restDirection = next.position.clone().normalize().applyQuaternion(entry.bindQuaternion);
    const rotation = new THREE.Quaternion().setFromUnitVectors(restDirection, direction).multiply(entry.bindQuaternion);
    thumbRotations.push(rotation);
    thumbParent.multiply(rotation);
    thumbPosition.add(next.position.clone().applyQuaternion(thumbParent));
  }
  for (const count of [1, 2, 3]) {
    const tracks = countArm.map(track => {
      const pose = Array.from(track.createInterpolant().evaluate(1.2));
      return new THREE.QuaternionKeyframeTrack(track.name, [0, 1], [...pose, ...pose]);
    });
    for (const digit of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      const extended = ['Index', 'Middle', 'Ring'].slice(0, count).includes(digit);
      for (let joint = 1; joint <= 3; joint++) {
        const name = `RightHand${digit}${joint}`, entry = character.rig[name];
        const angle = extended ? .015 : [.9, 1.2, .8][joint - 1];
        const pose = (digit === 'Thumb' ? thumbRotations[joint - 1] : entry.bindQuaternion.clone()
          .multiply(new THREE.Quaternion().setFromAxisAngle(character.gestures.flexAxes.get(name), angle))).toArray();
        tracks.push(new THREE.QuaternionKeyframeTrack(`${entry.bone.name}.quaternion`, [0, 1], [...pose, ...pose]));
      }
    }
    clips.push(new THREE.AnimationClip(`gesture_count_${count}`, 1, tracks));
  }
  const head = character.rig.Head;
  for (const [name, axis, strength] of [['head_nod', 'x', .15], ['head_shake', 'y', .17], ['head_tilt_left', 'z', .1], ['head_tilt_right', 'z', -.1]]) {
    const values = [], times = [];
    for (let frame = 0; frame <= 36; frame++) {
      const time = frame / 30, progress = frame / 36;
      const euler = new THREE.Euler(); euler[axis] = Math.sin(progress * Math.PI * 2) * Math.sin(progress * Math.PI) * strength;
      values.push(...head.bindQuaternion.clone().multiply(new THREE.Quaternion().setFromEuler(euler)).toArray());
      times.push(time);
    }
    clips.push(new THREE.AnimationClip(name, 1.2, [new THREE.QuaternionKeyframeTrack(`${head.bone.name}.quaternion`, times, values)]));
  }
  character.mixer.stopAllAction();
  for (const entry of Object.values(character.rig)) entry.bone.quaternion.copy(entry.bindQuaternion);
  model.position.set(0, 0, 0); model.rotation.set(0, 0, 0); model.scale.setScalar(.01);
  facialRig(mesh);
  model.traverse(node => {
    if (!node.isMesh) return;
    if (node !== mesh) node.geometry = mergeVertices(node.geometry, 1e-4);
    const originals = Array.isArray(node.material) ? node.material : [node.material];
    const materials = originals.map(material => new THREE.MeshStandardMaterial({ name: material.name,
      color: material.color, map: material.map?.image ? material.map : null,
      normalMap: material.normalMap?.image ? material.normalMap : null,
      transparent: material.transparent, opacity: material.opacity, side: material.side,
    }));
    node.material = Array.isArray(node.material) ? materials : materials[0];
    for (const material of materials) {
      material.metalness = 0; material.roughness = .85;
      // FBX textures are large PNGs. Bake opaque color maps to compact JPEGs.
      for (const key of ['map', 'normalMap']) {
        const texture = material[key];
        if (!texture?.image) continue;
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1024 / Math.max(texture.image.width, texture.image.height));
        canvas.width = Math.round(texture.image.width * scale); canvas.height = Math.round(texture.image.height * scale);
        canvas.getContext('2d').drawImage(texture.image, 0, 0, canvas.width, canvas.height);
        texture.image = canvas;
        texture.userData.mimeType = 'image/jpeg';
        texture.needsUpdate = true;
      }
    }
  });
  model.animations = clips;
  model.updateMatrixWorld(true);
  const binary = await new GLTFExporter().parseAsync(model, { binary: true, animations: clips, maxTextureSize: 1024 });
  const response = await fetch('/__save-character', { method: 'POST', body: binary });
  if (!response.ok) throw new Error('Could not save GLB');
  return { bytes: binary.byteLength, clips: clips.map(c => c.name), morphs: Object.keys(mesh.morphTargetDictionary), vertices: mesh.geometry.attributes.position.count };
}
