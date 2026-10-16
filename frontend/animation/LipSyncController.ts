import * as THREE from 'three';
import type { VisemeEvent } from '../types/performance';
import { prepareLipTimeline, visemeWeights } from './timeline';
export const REQUIRED_MORPHS = ['viseme_A', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U', 'viseme_MBP', 'viseme_FV', 'viseme_L', 'viseme_WQ', 'viseme_TH', 'viseme_CH', 'blinkLeft', 'blinkRight', 'smile', 'frown', 'browUp', 'browDown', 'browInnerUp', 'cheekRaise', 'eyeWide'];
// Ready Player Me uses Oculus visemes and ARKit expression names. Keep the
// original shape keys, including matching teeth, and resolve logical channels.
const aliases: Record<string, string[]> = {
  viseme_A: ['viseme_aa'], viseme_MBP: ['viseme_PP'], viseme_FV: ['viseme_FF'],
  viseme_L: ['viseme_nn'], viseme_WQ: ['viseme_RR'],
  blinkLeft: ['eyeBlinkLeft'], blinkRight: ['eyeBlinkRight'],
  smile: ['mouthSmileLeft', 'mouthSmileRight'], frown: ['mouthFrownLeft', 'mouthFrownRight'],
  browUp: ['browOuterUpLeft', 'browOuterUpRight'], browDown: ['browDownLeft', 'browDownRight'],
  cheekRaise: ['cheekSquintLeft', 'cheekSquintRight'], eyeWide: ['eyeWideLeft', 'eyeWideRight'],
  eyeLookUp: ['eyesLookUp'], eyeLookDown: ['eyesLookDown'],
};
function targets(mesh: THREE.Mesh, name: string) {
  const dictionary = mesh.morphTargetDictionary ?? {};
  return name in dictionary ? [name] : (aliases[name] ?? []);
}
export class LipSyncController {
  readonly meshes: THREE.Mesh[] = [];
  private source: VisemeEvent[] | null = null;
  private timeline: VisemeEvent[] = [];
  constructor(model: THREE.Object3D) {
    model.traverse(node => { if ((node as THREE.Mesh).morphTargetDictionary) this.meshes.push(node as THREE.Mesh); });
    const missing = REQUIRED_MORPHS.filter(name => !this.meshes.some(mesh => {
      const names = targets(mesh, name);
      return names.length > 0 && names.every(target => target in (mesh.morphTargetDictionary ?? {}));
    }));
    if (missing.length) throw new Error(`Morph wajah belum lengkap: ${missing.join(', ')}.`);
  }
  set(name: string, value: number) {
    for (const mesh of this.meshes) {
      for (const target of targets(mesh, name)) {
        const index = mesh.morphTargetDictionary?.[target];
        if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = value;
      }
    }
  }
  update(events: VisemeEvent[], time: number) {
    if (events !== this.source) {
      this.source = events;
      this.timeline = prepareLipTimeline(events);
    }
    const weights = visemeWeights(this.timeline, time);
    for (const name of REQUIRED_MORPHS.filter(name => name.startsWith('viseme_'))) this.set(name, weights[name.slice(7)] ?? 0);
    return weights;
  }
}
