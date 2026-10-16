// Plan phrasing separately from audio playback and facial animation.
export function chooseCue(text) {
  const words = text.toLowerCase();
  const mood = /\b(sedih|kecewa|duka)\b/.test(words) ? "sad"
    : /\b(marah|kesal|geram)\b/.test(words) ? "angry"
      : /\b(gembira|bahagia|hebat|selamat)\b/.test(words) ? "joyful" : "happy";
  const counting = words.match(/\b(satu|pertama|dua|kedua|tiga|ketiga|[123])\b/);
  if (/\b(selamat datang|halo|hai|salam)\b/.test(words)) return { gesture: "welcome", mood };
  if (counting) {
    const count = /tiga|ketiga|3/.test(counting[0]) ? 3 : /dua|kedua|2/.test(counting[0]) ? 2 : 1;
    return { gesture: "count", count, mood };
  }
  if (/\b(perhatikan|lihat|ini|tunjuk)\b/.test(words)) return { gesture: "pointRight", mood };
  return { gesture: "explain", mood };
}

export function prepareScript(text) {
  const clean = text.trim();
  if (!clean) throw new Error("Tulis naskah terlebih dahulu.");
  if (clean.length > 5000) throw new Error("Naskah maksimal 5.000 karakter.");
  const segmenter = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("id", { granularity: "sentence" }) : null;
  const parts = [];
  for (const line of clean.split(/\r?\n+/).map(line => line.trim()).filter(Boolean)) {
    // A vowel exercise is spoken one sound at a time, never as an acronym.
    if (/^[aiueo](?:[\s,.;:!?–—-]+[aiueo])*[\s,.;:!?]*$/i.test(line)) {
      for (const vowel of line.toLowerCase().match(/[aiueo]/g)) {
        parts.push({ text: `${vowel}.`, vowel, cue: { gesture: "explain", mood: "relaxed" }, pauseAfterMs: 400 });
      }
      continue;
    }
    const sentences = segmenter ? [...segmenter.segment(line)].map(part => part.segment)
      : line.match(/[^.!?]+[.!?]*/g) ?? [line];
    for (const sentence of sentences) {
      let remaining = sentence.trim();
      while (remaining) {
        let length = Math.min(220, remaining.length);
        if (remaining.length > length) {
          // Prefer an existing clause boundary to cutting off mid-thought.
          const clauses = [...remaining.slice(0, length).matchAll(/[,;:]\s/g)];
          const boundary = clauses.at(-1)?.index;
          const space = remaining.lastIndexOf(" ", length);
          if (boundary >= 80) length = boundary + 1;
          else if (space > 0) length = space;
        }
        const part = remaining.slice(0, length).trim();
        if (part) parts.push({ text: part, cue: chooseCue(part), pauseAfterMs: /[.!?]$/.test(part) ? 140 : 80 });
        remaining = remaining.slice(length).trim();
      }
    }
    if (parts.length) parts.at(-1).pauseAfterMs = 320;
  }
  return parts;
}

export function deliveryRate(part, rate) {
  return part.vowel ? Math.min(rate, 0.8) : rate;
}

export function waitForPause(milliseconds, signal) {
  if (signal.aborted || milliseconds <= 0) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}
