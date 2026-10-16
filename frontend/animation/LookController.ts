import * as THREE from 'three';
import type { LipSyncController } from './LipSyncController';
export class LookController {
  private head?: THREE.Object3D;
  private spine?: THREE.Object3D;
  private rotation = new THREE.Quaternion();
  private target = new THREE.Vector3();
  private origin = new THREE.Vector3();
  constructor(private model: THREE.Object3D, private lips?: LipSyncController) {
    model.traverse(node => { if (/Head$/.test(node.name)) this.head = node; if (/Spine$/.test(node.name)) this.spine = node; });
  }
  update(time: number, camera: THREE.Camera, energy = .45) {
    this.model.updateMatrixWorld(true);
    if (this.head) {
      this.head.getWorldPosition(this.origin); camera.getWorldPosition(this.target); this.target.sub(this.origin);
      const yaw = THREE.MathUtils.clamp(Math.atan2(this.target.x, this.target.z), -.35, .35);
      const pitch = THREE.MathUtils.clamp(-Math.atan2(this.target.y, Math.hypot(this.target.x, this.target.z)), -.12, .12);
      this.rotation.setFromEuler(new THREE.Euler(pitch + .01 * Math.sin(time * 1.2), yaw + .012 * Math.sin(time * .71), .008 * Math.sin(time * .93)));
      this.head.quaternion.multiply(this.rotation);
      const eyeX = yaw * .7 + .06 * Math.sin(time * .61);
      const eyeY = -pitch * .8 + .04 * Math.sin(time * .83);
      this.lips?.set('eyeLookLeft', Math.max(0, eyeX)); this.lips?.set('eyeLookRight', Math.max(0, -eyeX));
      this.lips?.set('eyeLookUp', Math.max(0, eyeY)); this.lips?.set('eyeLookDown', Math.max(0, -eyeY));
    }
    if (this.spine) {
      this.rotation.setFromEuler(new THREE.Euler(.004 * Math.sin(time * 1.6), .004 * energy * Math.sin(time), .003 * Math.sin(time * .6)));
      this.spine.quaternion.multiply(this.rotation);
    }
  }
}
