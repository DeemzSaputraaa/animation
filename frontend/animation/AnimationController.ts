import * as THREE from 'three';

export class AnimationController {
  readonly mixer: THREE.AnimationMixer;
  readonly actions = new Map<string, THREE.AnimationAction>();
  readonly missing = new Set<string>();
  private poses = new Map<THREE.Object3D, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();
  private idleLayers: { name: string; action: THREE.AnimationAction; contributors: string[] }[] = [];
  constructor(readonly model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(model);
    model.traverse(node => { if ((node as THREE.Bone).isBone) this.poses.set(node, { position: node.position.clone(), quaternion: node.quaternion.clone() }); });
    const motions = clips.filter(clip => !clip.name.startsWith('idle_'))
      .map(clip => ({ name: clip.name, tracks: new Set(clip.tracks.map(track => track.name)) }));
    for (const clip of clips) {
      let base = clip;
      if (clip.name.startsWith('idle_')) {
        // Give idle only the remaining weight on bones driven by a gesture.
        // Group identical binding masks so the legs, opposite arm, and face
        // remain independent; fading the whole idle would restore a T-pose.
        const groups = new Map<string, { tracks: THREE.KeyframeTrack[]; contributors: string[] }>();
        for (const track of clip.tracks) {
          const contributors = motions.filter(motion => motion.tracks.has(track.name)).map(motion => motion.name);
          const key = contributors.join('|');
          const group = groups.get(key) ?? { tracks: [], contributors };
          group.tracks.push(track); groups.set(key, group);
        }
        base = new THREE.AnimationClip(clip.name, clip.duration, groups.get('')?.tracks ?? []);
        let index = 0;
        for (const [key, group] of groups) {
          if (!key) continue;
          const layer = new THREE.AnimationClip(`${clip.name}_layer_${index++}`, clip.duration, group.tracks);
          const action = this.mixer.clipAction(layer);
          action.play(); action.paused = true; action.setEffectiveWeight(0);
          this.idleLayers.push({ name: clip.name, action, contributors: group.contributors });
        }
      }
      const action = this.mixer.clipAction(base);
      action.play(); action.paused = true; action.setEffectiveWeight(0);
      this.actions.set(clip.name, action);
    }
    if (!this.actions.has('idle_neutral')) throw new Error('Klip idle_neutral tidak tersedia pada karakter.');
  }
  reset() {
    for (const action of this.actions.values()) action.setEffectiveWeight(0);
    for (const { action } of this.idleLayers) action.setEffectiveWeight(0);
  }
  activate() {
    for (const action of [...this.actions.values(), ...this.idleLayers.map(layer => layer.action)]) { action.play(); action.paused = true; }
  }
  sample(name: string, time: number, weight: number, loop = false) {
    const action = this.actions.get(name);
    if (!action) { this.missing.add(name); return false; }
    const duration = action.getClip().duration;
    action.enabled = true;
    action.time = loop ? ((time % duration) + duration) % duration : Math.max(0, Math.min(duration - .00001, time));
    action.setEffectiveWeight(weight);
    for (const layer of this.idleLayers) {
      if (layer.name !== name) continue;
      layer.action.enabled = true;
      layer.action.time = action.time;
      layer.action.setEffectiveWeight(weight);
    }
    return true;
  }
  evaluate() {
    // Restore the last mixer pose so additive look/breathing offsets never
    // accumulate when a constant track is skipped by PropertyMixer.
    for (const [bone, pose] of this.poses) { bone.position.copy(pose.position); bone.quaternion.copy(pose.quaternion); }
    for (const layer of this.idleLayers) {
      const gestureWeight = layer.contributors.reduce((sum, name) => sum + (this.actions.get(name)?.getEffectiveWeight() ?? 0), 0);
      const idleWeight = this.actions.get(layer.name)?.getEffectiveWeight() ?? 0;
      layer.action.setEffectiveWeight(idleWeight * Math.max(0, 1 - gestureWeight));
    }
    this.mixer.update(0);
    for (const [bone, pose] of this.poses) { pose.position.copy(bone.position); pose.quaternion.copy(bone.quaternion); }
  }
  dispose() { this.mixer.stopAllAction(); }
}
