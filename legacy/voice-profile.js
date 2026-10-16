export const DEFAULT_SPEECH_RATE = 0.95;

export function isIndonesianVoice(voice) {
  return /^id(?:[-_]|$)/i.test(voice?.lang ?? "");
}

export function isMaleVoice(voice) {
  // Web Speech exposes no gender field. Only recognize explicit names/labels;
  // do not assume the default Google Indonesian voice is male.
  const name = voice?.name ?? "";
  return /\b(male|masculine|pria|laki[- ]laki)\b/i.test(name)
    || (isIndonesianVoice(voice) && /\bArdi(?:Neural)?\b/i.test(name));
}

export function preferredVoice(voices) {
  const indonesian = voices.filter(isIndonesianVoice);
  const score = (voice) => Number(isMaleVoice(voice)) * 10
    + Number(/natural|neural/i.test(voice.name)) * 2 + Number(Boolean(voice.default));
  return indonesian.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function speechDelivery(part, voice, rate = DEFAULT_SPEECH_RATE) {
  // Small changes between sentences keep the register steady. Large pitch
  // shifts make browser voices sound processed rather than conversational.
  let pitch = isMaleVoice(voice) ? 0.94 : 0.86;
  let pace = Number(rate) || DEFAULT_SPEECH_RATE;
  if (part.cue.mood === "sad") { pitch -= 0.02; pace *= 0.97; }
  else if (part.cue.mood === "joyful") { pitch += 0.02; pace *= 1.02; }
  if (/\?\s*$/.test(part.text)) pitch += 0.03;
  else if (/!\s*$/.test(part.text)) pitch += 0.01;
  return { pitch, rate: Math.max(0.6, Math.min(1.3, pace)), volume: 1 };
}
