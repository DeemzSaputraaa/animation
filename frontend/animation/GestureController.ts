import type { MotionEvent } from '../types/performance';
import { AnimationController } from './AnimationController';
import { eventWeight, smooth } from './timeline';
import { countNumber } from './countClips';
export function relaxedGesture(event: MotionEvent): MotionEvent {
  // Explicit word-aligned count fades must keep their original timing.
  if (countNumber(event.animation) || event.animation.startsWith('head_')) return event;
  return { ...event, fade_in: event.fade_in ?? Math.min(.55, event.duration * .32),
    fade_out: event.fade_out ?? Math.min(.7, event.duration * .38) };
}
export class GestureController {
  constructor(private animation: AnimationController, private relaxed = false) {}
  update(events: MotionEvent[], time: number) {
    for (const event of events) {
      const weight = eventWeight(this.relaxed ? relaxedGesture(event) : event, time);
      if (!weight) continue;
      const action = this.animation.actions.get(event.animation);
      const duration = action?.getClip().duration ?? 2.4;
      const phase = (time - event.start) / event.duration;
      const ease = this.relaxed && !countNumber(event.animation) && !event.animation.startsWith('head_');
      const local = (ease ? smooth(phase) : phase) * duration * event.speed;
      if (!this.animation.sample(event.animation, local, weight)) {
        this.animation.sample('gesture_open_hand', local, weight * .8);
      }
    }
  }
}
