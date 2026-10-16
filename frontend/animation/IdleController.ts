import { AnimationController } from './AnimationController';
import { smooth } from './timeline';
export class IdleController {
  constructor(private animation: AnimationController, private blendDuration = .4) {}
  update(time: number) {
    const variants = ['idle_neutral', 'idle_breathing', 'idle_relaxed', 'idle_shift_weight', 'idle_breathing'];
    const cycle = Math.floor(time / 8), phase = time % 8;
    const current = variants[cycle % variants.length], previous = variants[(cycle + variants.length - 1) % variants.length];
    const blend = smooth(phase / this.blendDuration);
    this.animation.sample(previous, time, 1 - blend, true);
    this.animation.sample(current, time, blend, true);
  }
}
