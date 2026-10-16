import type { Emotion, EmotionEvent, Sentence, Word } from '../types/performance';
import { LipSyncController } from './LipSyncController';
import { blinkWeight, clamp, smooth } from './timeline';
import type { ExpressionId, ExpressionSettings } from '../expressions';

const channels = ['smile', 'frown', 'browUp', 'browDown', 'browInnerUp', 'cheekRaise', 'eyeWide', 'squint'] as const;
type FacePose = Record<typeof channels[number], number>;
const profiles: Record<Emotion, number[]> = {
  neutral:   [.06, 0, .09, 0, 0, .04, .03, .01],
  friendly:  [.60, 0, .25, 0, 0, .30, .06, .05],
  happy:     [.86, 0, .34, 0, 0, .55, .04, .12],
  serious:   [0, .09, 0, .62, .04, 0, 0, .11],
  thinking:  [.03, 0, .16, .09, .50, 0, .06, .06],
  excited:   [.96, 0, .72, 0, 0, .48, .38, 0],
  concerned: [0, .58, 0, .16, .68, 0, .04, .04],
};
export interface FaceAccent { time: number; duration: number }

const manualProfiles: Record<Exclude<ExpressionId, 'auto'>, number[]> = {
  neutral:   [0, 0, 0, 0, 0, 0, 0, 0],
  smile:     [.62, 0, .08, 0, 0, .18, 0, .04],
  pleased:   [.76, 0, .22, 0, 0, .42, .06, .12],
  happy:     [1, 0, .38, 0, 0, .78, .04, .24],
  laugh:     [1, 0, .26, 0, 0, .92, 0, .48],
  sad:       [0, .75, 0, .12, .88, 0, 0, .08],
  angry:     [0, .42, 0, 1, .08, 0, .08, .24],
  surprised: [0, 0, .95, 0, .35, 0, .88, 0],
  thinking:  [.03, 0, .16, .09, .65, 0, .06, .06],
  serious:   [0, .10, 0, .60, .04, 0, 0, .12],
};

export function manualFaceWeights(expression: Exclude<ExpressionId, 'auto'>, intensity: number, time: number,
  rounded = 0, closed = 0, speaking = false): FacePose & { jawOpen: number } {
  const strength = Number.isFinite(intensity) ? clamp(intensity) : 0;
  const pose = Object.fromEntries(channels.map((name, index) => [name, manualProfiles[expression][index] * strength])) as FacePose;
  // A small repeated jaw motion reads as laughter while previewing. During
  // speech all jaw opening belongs to visemes, including closed M/B/P sounds.
  const jawOpen = speaking ? 0 : expression === 'laugh'
    ? strength * (.28 + .30 * (1 + Math.sin(time * 10)) / 2)
    : expression === 'surprised' ? strength * .24 : 0;
  const mouthFreedom = (1 - .75 * clamp(rounded)) * (1 - clamp(closed));
  pose.smile *= mouthFreedom; pose.frown *= mouthFreedom;
  return { ...pose, jawOpen: jawOpen * (1 - clamp(closed)) };
}

export function faceWeights(events: EmotionEvent[], time: number, rounded: number, closed = 0, accents: FaceAccent[] = []): FacePose {
  const values = channels.map(() => 0);
  let total = 0;
  for (const event of events) {
    // Anticipate speech slightly and carry expression across short pauses.
    const envelope = smooth((time - event.start + .22) / .5) * smooth((event.end + .55 - time) / .6);
    if (!envelope) continue;
    const strength = (.82 + .28 * clamp(event.energy)) * (.96 + .04 * Math.sin((time - event.start) * 1.8));
    profiles[event.emotion].forEach((value, i) => { values[i] += value * envelope * strength; });
    total += envelope;
  }
  const pose = Object.fromEntries(channels.map((name, i) => [name,
    (values[i] + profiles.neutral[i] * Math.max(0, 1 - total)) / Math.max(1, total),
  ])) as FacePose;
  let accent = 0;
  for (const cue of accents) {
    accent = Math.max(accent, smooth((time - cue.time + .12) / .24)
      * smooth((cue.time + cue.duration + .3 - time) / .35));
  }
  // Serious/concerned emphasis knits the brows rather than looking cheerful.
  const knitted = clamp(pose.browDown + pose.browInnerUp);
  pose.browUp += accent * .22 * (1 - knitted);
  pose.browDown += accent * .12 * knitted;
  const mouthFreedom = (1 - .75 * clamp(rounded)) * (1 - clamp(closed));
  pose.smile *= mouthFreedom; pose.frown *= mouthFreedom;
  for (const name of channels) pose[name] = clamp(pose[name]);
  return pose;
}

export class FaceController {
  private words?: Word[];
  private sentences?: Sentence[];
  private accents: FaceAccent[] = [];
  constructor(private lips: LipSyncController) {}
  update(events: EmotionEvent[], time: number, rounded: number, closed = 0, words?: Word[], sentences?: Sentence[], settings?: ExpressionSettings) {
    if (words !== this.words || sentences !== this.sentences) {
      this.words = words; this.sentences = sentences;
      this.accents = (words ?? []).filter(word => {
        const sentence = sentences?.find(s => word.char_index >= s.char_start && word.char_index < s.char_end);
        const token = word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        return token && sentence?.emphasis.some(phrase => phrase.toLowerCase().split(/\s+/).includes(token));
      }).map(word => ({ time: word.time, duration: Math.min(.6, Math.max(.18, word.duration)) }));
    }
    const manual = settings && settings.expression !== 'auto'
      ? manualFaceWeights(settings.expression, settings.intensity, time, rounded, closed, settings.speaking) : null;
    const pose = manual ?? faceWeights(events, time, rounded, closed, this.accents);
    this.lips.set('jawOpen', manual?.jawOpen ?? 0);
    for (const name of channels) if (name !== 'squint') this.lips.set(name, pose[name]);
    const blink = blinkWeight(time);
    // Preserve a complete blink while keeping a little eyelid warmth in smiles.
    this.lips.set('eyeWide', pose.eyeWide * (1 - blink));
    this.lips.set('blinkLeft', blink + pose.squint * (1 - blink));
    this.lips.set('blinkRight', blink + pose.squint * (1 - blink));
  }
}
