import * as THREE from 'three';
import type { MotionEvent } from '../types/performance';
import { clamp, eventWeight } from './timeline';
import { relaxedGesture } from './GestureController';
import { countNumber } from './countClips';

// Applied after the mixer restores its pose. Sample from the audio clock,
// never from accumulated frame deltas, so pause and backward seek stay exact.
export class BodyMotionController {
  private bones = new Map<string, THREE.Object3D>();
  private rotation = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private previousShoulder = new THREE.Quaternion();
  private armCompensation = new THREE.Quaternion();
  private shoulderPosture = {
    Left: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, .10, .45)),
    Right: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -.10, -.45)),
  };
  constructor(model: THREE.Object3D) {
    model.traverse(node => {
      if ((node as THREE.Bone).isBone) this.bones.set(node.name.replace(/^mixamorig\d*:?/, ''), node);
    });
  }
  private turn(name: string, x: number, y: number, z: number) {
    const bone = this.bones.get(name);
    if (bone) bone.quaternion.multiply(this.rotation.setFromEuler(this.euler.set(x, y, z)));
  }
  update(time: number, events: MotionEvent[] = []) {
    let left = 0, right = 0, lead = 0;
    for (const event of events) {
      const cue = relaxedGesture(event);
      const weight = eventWeight(cue, time);
      const anticipation = eventWeight(cue, time + .12);
      const onlyLeft = event.animation === 'gesture_explain_left';
      const count = countNumber(event.animation);
      const onlyRight = event.animation === 'gesture_explain_right' || (count > 0 && count <= 5);
      if (!onlyRight) left += weight;
      if (!onlyLeft) right += weight;
      lead += anticipation * (onlyLeft ? 1 : onlyRight || event.animation === 'gesture_point' ? -1 : 0);
    }
    const breathe = Math.sin(time * 1.47);
    const settle = .7 * Math.sin(time * .67) + .3 * Math.sin(time * 1.13 + .8);
    // Keep the pelvis and legs untouched: torso balance must not slide feet.
    this.turn('Spine', .012 * breathe, .012 * settle, .016 * settle);
    this.turn('Spine1', .008 * Math.sin(time * 1.47 - .15), .018 * clamp(Math.abs(lead)) * Math.sign(lead), .008 * settle);
    this.turn('Spine2', -.006 * breathe, .01 * Math.sin(time * .83 + .5), -.009 * settle);
    for (const [side, sign, activity, phase] of [['Left', 1, left, .7], ['Right', -1, right, 2.1]] as const) {
      const rest = 1 - clamp(activity);
      // Stagger shoulder, elbow and wrist movement so the arm does not move
      // as one rigid rod. Fade the relaxed pose out under authored gestures.
      this.turn(`${side}Shoulder`, .008 * breathe, 0, sign * .009 * Math.sin(time * 1.47 - .2));
      const shoulder = this.bones.get(`${side}Shoulder`), arm = this.bones.get(`${side}Arm`);
      if (shoulder && arm) {
        // Correct the pronounced downward clavicle angle transferred from
        // the source rig; the outer shoulders should sit close to level.
        // Counter-rotate the upper arm so raising the shoulder does not push
        // the resting arms outward or rotate a counting palm away from view.
        this.previousShoulder.copy(shoulder.quaternion);
        shoulder.quaternion.premultiply(this.shoulderPosture[side]);
        this.armCompensation.copy(shoulder.quaternion).invert().multiply(this.previousShoulder);
        arm.quaternion.premultiply(this.armCompensation);
      }
      this.turn(`${side}Arm`, rest * .026 * Math.sin(time * .91 + phase), rest * .018 * settle, sign * rest * .016 * Math.sin(time * .73 + phase));
      this.turn(`${side}ForeArm`, rest * (.10 + .035 * Math.sin(time * .91 + phase - .25)), rest * .025 * Math.sin(time * .63 + phase), 0);
      this.turn(`${side}Hand`, rest * (.035 + .04 * Math.sin(time * .91 + phase - .5)), rest * .025 * Math.sin(time * .71 + phase), 0);
      for (const [index, digit] of ['Index', 'Middle', 'Ring', 'Pinky'].entries()) {
        const curl = rest * (1 + index * .13) * (1 + .12 * Math.sin(time * .8 + phase));
        for (const [joint, angle] of [[1, .10], [2, .18], [3, .12]]) this.turn(`${side}Hand${digit}${joint}`, curl * angle, 0, 0);
      }
    }
  }
}
