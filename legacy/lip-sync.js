export const REST_MOUTH = Object.freeze({ open: 0, round: 0, wide: 0 });
// Distinct held targets: A = open, I = wide, U = narrow/rounded,
// E = half-open/wide, O = open/rounded. All values stay in the rig's 0–1 range.
export const VOWEL_POSES = Object.freeze({
  a: Object.freeze({ open: 1, round: 0, wide: 0.08 }),
  i: Object.freeze({ open: 0.18, round: 0, wide: 1 }),
  u: Object.freeze({ open: 0.16, round: 1, wide: 0 }),
  e: Object.freeze({ open: 0.48, round: 0, wide: 0.65 }),
  o: Object.freeze({ open: 0.68, round: 0.85, wide: 0 }),
});
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => ({ open: a.open + (b.open - a.open) * t, round: a.round + (b.round - a.round) * t, wide: a.wide + (b.wide - a.wide) * t });

function shape(sound) {
  if (/[mbp]/.test(sound) && sound.length === 1) return REST_MOUTH;
  if (Object.hasOwn(VOWEL_POSES, sound)) return VOWEL_POSES[sound];
  if (sound === "y") return VOWEL_POSES.i;
  if (sound === "w") return VOWEL_POSES.u;
  if (sound === "f" || sound === "v") return { open: 0.08, round: 0, wide: 0.18 };
  return { open: 0.16, round: 0, wide: 0.12 };
}

// Indonesian spelling is used to estimate sounds *within* each real word
// interval. These are not phoneme timestamps supplied by the TTS service.
export function buildVisemes(words) {
  const timeline = [];
  const valid = words.filter(word => typeof word.text === "string" && Number.isFinite(word.time)
    && Number.isFinite(word.duration) && word.duration > 0 && word.time >= 0).sort((a, b) => a.time - b.time);
  for (let index = 0; index < valid.length; index++) {
    const word = valid[index];
    const sounds = word.text.toLocaleLowerCase("id").normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/ng|ny|sy|kh|[a-z]/g) ?? [];
    const end = Math.min(word.time + word.duration, valid[index + 1]?.time ?? Infinity);
    if (!sounds.length || end <= word.time) continue;
    const weights = sounds.map(sound => /^[aiueo]$/.test(sound) ? 1.9 : /^[mbp]$/.test(sound) ? 0.9 : 0.65);
    const unit = (end - word.time) / weights.reduce((sum, weight) => sum + weight, 0);
    let start = word.time;
    sounds.forEach((sound, i) => {
      const finish = i === sounds.length - 1 ? end : start + unit * weights[i];
      timeline.push({ start, end: finish, sound, pose: shape(sound) });
      start = finish;
    });
  }
  return timeline;
}

// Decode once, measure short PCM windows once; the render loop only samples.
export function analyzeSpeechEnergy(buffer) {
  const pcm = buffer.getChannelData(0);
  const stride = Math.max(1, Math.round(buffer.sampleRate * 0.01));
  const values = new Float32Array(Math.ceil(pcm.length / stride));
  for (let block = 0; block < values.length; block++) {
    const start = block * stride, end = Math.min(pcm.length, start + stride);
    let sum = 0;
    for (let i = start; i < end; i++) sum += pcm[i] * pcm[i];
    values[block] = Math.sqrt(sum / (end - start));
  }
  const voiced = [...values].filter(value => value > 0.001).sort((a, b) => a - b);
  const reference = voiced[Math.floor(voiced.length * 0.8)] || 0.1;
  return { values, step: stride / buffer.sampleRate, reference };
}

export function sampleVisemes(timeline, time, energy) {
  if (!Number.isFinite(time)) return REST_MOUTH;
  let low = 0, high = timeline.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (timeline[middle].end <= time) low = middle + 1;
    else high = middle - 1;
  }
  const current = timeline[low];
  if (!current || time < current.start) return REST_MOUTH;
  const previous = timeline[low - 1], next = timeline[low + 1];
  const fade = Math.min(0.025, (current.end - current.start) * 0.25);
  let pose = current.pose;
  if (time < current.start + fade) {
    const from = previous && Math.abs(previous.end - current.start) < 0.001 ? previous.pose : REST_MOUTH;
    pose = mix(from, pose, ease((time - current.start) / fade));
  } else if (time > current.end - fade && (!next || next.start - current.end > 0.001)) {
    pose = mix(pose, REST_MOUTH, ease((time - current.end + fade) / fade));
  }
  if (!energy) return pose;
  const frame = time / energy.step - 0.5;
  const index = Math.max(0, Math.floor(frame));
  const a = energy.values[index] ?? 0, b = energy.values[index + 1] ?? 0;
  const rms = a + (b - a) * clamp(frame - index);
  const floor = Math.max(0.0015, energy.reference * 0.035);
  const activity = ease((rms - floor) / (floor * 3));
  const loudness = 0.72 + 0.28 * clamp(rms / energy.reference);
  return { open: pose.open * activity * loudness, round: pose.round * activity, wide: pose.wide * activity };
}

// Follow the device's output clock rather than accumulating animation delta.
export function audibleTime(context, now = performance.now()) {
  const stamp = context.getOutputTimestamp?.();
  if (stamp?.performanceTime > 0 && Number.isFinite(stamp.contextTime)) {
    return Math.min(context.currentTime, stamp.contextTime + Math.max(0, now - stamp.performanceTime) / 1000);
  }
  return context.currentTime - (context.outputLatency || 0) - (context.baseLatency || 0);
}
