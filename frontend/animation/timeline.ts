import type { MotionEvent, VisemeEvent } from '../types/performance';
export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function eventWeight(event: MotionEvent, time: number): number {
  const elapsed = time - event.start;
  if (elapsed <= 0 || elapsed >= event.duration) return 0;
  const fade = Math.min(.3, event.duration / 2);
  const attack = Math.max(.001, event.fade_in ?? fade);
  const release = Math.max(.001, event.fade_out ?? fade);
  return event.weight * smooth(elapsed / attack) * smooth((event.duration - elapsed) / release);
}

export function prepareLipTimeline(events: VisemeEvent[]): VisemeEvent[] {
  const vowels = new Set(['A', 'E', 'I', 'O', 'U']);
  const subtle = new Set(['rest', 'L', 'TH', 'CH']);
  const result: VisemeEvent[] = [];
  for (let index = 0; index < events.length; index++) {
    const event = events[index], previous = events[index - 1], next = events[index + 1];
    let prepared = { ...event };
    // Tiny estimated tongue/consonant movements between vowels need not
    // produce a full new jaw pose. Preserve real pauses and MBP/FV closure.
    if (subtle.has(event.viseme) && event.end - event.time < .075
      && previous && next && vowels.has(previous.viseme) && vowels.has(next.viseme)
      && Math.abs(previous.end - event.time) < .001 && Math.abs(event.end - next.time) < .001) {
      prepared = { ...prepared, viseme: previous.viseme, weight: previous.weight };
    }
    const last = result.at(-1);
    if (last && last.viseme === prepared.viseme && last.weight === prepared.weight
      && Math.abs(last.end - prepared.time) < .001) last.end = prepared.end;
    else result.push(prepared);
  }
  return result;
}

export function visemeWeights(events: VisemeEvent[], time: number): Record<string, number> {
  if (!Number.isFinite(time)) return {};
  let low = 0, high = events.length;
  while (low < high) { const middle = (low + high) >>> 1; if (events[middle].end <= time) low = middle + 1; else high = middle; }
  const current = events[low];
  if (!current || time < current.time || current.viseme === 'rest') return {};
  const weights: Record<string, number> = {};
  const add = (event: VisemeEvent | undefined, weight: number) => {
    if (event && event.viseme !== 'rest') weights[event.viseme] = (weights[event.viseme] || 0) + event.weight * weight;
  };
  const previous = events[low - 1], next = events[low + 1];
  if (current.viseme === 'MBP') { add(current, 1); return weights; }
  const duration = current.end - current.time;
  const adjoiningPrevious = previous && Math.abs(previous.end - current.time) < .001;
  const adjoiningNext = next && Math.abs(next.time - current.end) < .001;
  const blendPrevious = adjoiningPrevious && !['rest', 'MBP'].includes(previous.viseme);
  const blendNext = adjoiningNext && !['rest', 'MBP'].includes(next.viseme);
  // Center up to 110 ms of coarticulation on the *audio* boundary. This
  // softens rapid poses without a delayed frame filter or accumulated drift.
  const attack = blendPrevious ? Math.min(.055, duration * .45, (previous.end - previous.time) * .45)
    : Math.min(.085, duration * .45);
  const release = blendNext ? Math.min(.055, duration * .45, (next.end - next.time) * .45)
    : Math.min(.065, duration * .45);
  if (time < current.time + attack) {
    const blend = smooth(blendPrevious ? (time - current.time + attack) / (2 * attack) : (time - current.time) / attack);
    if (adjoiningPrevious) add(previous, 1 - blend);
    add(current, blend);
  } else if (time > current.end - release) {
    const blend = smooth((time - current.end + release) / (blendNext ? 2 * release : release));
    add(current, 1 - blend);
    if (adjoiningNext) add(next, blend);
  } else add(current, 1);
  return weights;
}

export function blinkWeight(time: number): number {
  // Deterministic irregular schedule supports exact pause/resume and seeking.
  const intervals = [3.1, 4.7, 2.8, 5.4, 3.8, 4.3];
  const period = intervals.reduce((sum, n) => sum + n, 0);
  let cursor = 0;
  const local = ((time % period) + period) % period;
  for (const interval of intervals) {
    cursor += interval;
    const phase = local - (cursor - .24);
    if (phase >= 0 && phase < .24) return smooth(phase / .08) * (1 - smooth((phase - .11) / .13));
  }
  return 0;
}
