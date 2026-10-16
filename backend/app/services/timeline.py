from . import emotion, gesture, phoneme, viseme


def analyze_script(text: str) -> tuple[list[dict], list[str]]:
    sentences, warnings = emotion.segment(text), []
    for sentence in sentences:
        try:
            sentence.update(emotion.analyze(sentence["text"]))
        except Exception:
            sentence.update(emotion="neutral", energy=0.45, emphasis=[])
            warnings.append("Analisis emosi memakai ekspresi netral.")
    return sentences, warnings


def build(text: str, words: list[dict], duration: float, audio_url: str, sentences=None, warnings=None) -> dict:
    if sentences is None:
        sentences, warnings = analyze_script(text)
    warnings = list(warnings or [])
    cursor, current = 0, 0
    buckets = [[] for _ in sentences]
    for word in words:
        found = text.lower().find(word["text"].lower(), cursor)
        word["char_index"] = found
        if found >= 0:
            cursor = found + len(word["text"])
            while current + 1 < len(sentences) and found >= sentences[current]["char_end"]:
                current += 1
        buckets[current].append(word)
    for index, sentence in enumerate(sentences):
        assigned = buckets[index]
        sentence["start"] = assigned[0]["time"] if assigned else duration * sentence["char_start"] / len(text)
        sentence["end"] = assigned[-1]["time"] + assigned[-1]["duration"] if assigned else duration * sentence["char_end"] / len(text)
        sentence["end"] = min(duration, sentence["end"])
    try:
        gestures, head = gesture.plan(sentences, text)
    except Exception:
        warnings.append("Perencanaan gesture memakai variasi dasar.")
        gestures = [{"start": t, "duration": min(2, duration - t), "animation": gesture.GESTURES[i % 4], "weight": 0.55, "speed": 1}
                    for i, t in enumerate(range(1, max(1, int(duration) - 1), 3))]
        head = []
    counts = gesture.plan_counts(words, duration)
    # Explicit word-timed counts take priority over conversational gestures.
    gestures = [event for event in gestures if not any(
        event["start"] < count["start"] + count["duration"]
        and event["start"] + event["duration"] > count["start"] for count in counts)]
    gestures = sorted(gestures + counts, key=lambda event: event["start"])
    phonemes = phoneme.generate(words)
    return {"version": 1, "duration": duration, "audio": audio_url, "text": text, "language": "id-ID",
            "timing_source": "tts-word-boundaries/estimated-indonesian-phonemes", "analysis_source": "semantic-rules-v1",
            "warnings": sorted(set(warnings)), "sentences": sentences, "words": words, "phonemes": phonemes,
            "emotion": [{"start": s["start"], "end": s["end"], "emotion": s["emotion"], "energy": s["energy"]} for s in sentences],
            "gestures": gestures, "head": head, "visemes": viseme.generate(phonemes, duration)}
