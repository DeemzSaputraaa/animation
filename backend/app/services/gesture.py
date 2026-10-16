import hashlib
import random
import re

GESTURES = ["gesture_open_hand", "gesture_explain_left", "gesture_explain_right", "gesture_both_hands", "gesture_emphasis", "gesture_point", "gesture_count", "gesture_question"]


def plan(sentences: list[dict], text: str) -> tuple[list[dict], list[dict]]:
    rng = random.Random(int.from_bytes(hashlib.sha256(text.encode()).digest()[:8], "big"))
    gestures, head = [], []
    next_allowed, previous = 0.3, ""
    for sentence in sentences:
        words = sentence["text"].lower()
        if re.search(r"selamat datang|halo|terima kasih", words):
            candidates = ["gesture_open_hand", "gesture_both_hands"]
        elif re.search(r"\b(pertama|ke(?:dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\b", words):
            candidates = ["gesture_emphasis", "gesture_open_hand"]
        elif "?" in words or sentence["emotion"] == "thinking":
            candidates = ["gesture_question", "gesture_open_hand"]
        elif re.search(r"perhatikan|lihat|bagian ini", words):
            candidates = ["gesture_point", "gesture_emphasis"]
        elif sentence["emphasis"]:
            candidates = ["gesture_emphasis", "gesture_both_hands"]
        else:
            candidates = ["gesture_explain_right", "gesture_both_hands", "gesture_open_hand", "gesture_explain_left"]
        start = max(sentence["start"] + 0.25, next_allowed)
        while start + 0.6 < sentence["end"]:
            pool = [item for item in candidates if item != previous] or ["gesture_open_hand"]
            animation = rng.choice(pool)
            duration = min(2.2, sentence["end"] - start)
            gestures.append({"start": round(start, 4), "duration": round(duration, 4), "animation": animation,
                             "weight": round(rng.uniform(0.55, 0.75) * (0.8 if sentence["emotion"] == "serious" else 1), 3),
                             "speed": round(rng.uniform(0.9, 1.1), 3)})
            previous = animation
            spacing = rng.uniform(3.1, 4) if sentence["emotion"] in ("serious", "concerned") else rng.uniform(2.4, 3.7)
            next_allowed = start + spacing
            start = next_allowed
        if sentence["end"] - sentence["start"] > 1:
            animation = "head_tilt_left" if sentence["emotion"] == "thinking" else "head_shake" if re.search(r"\b(tidak|jangan)\b", words) else "head_nod"
            head.append({"start": sentence["start"] + 0.4, "duration": min(1.1, sentence["end"] - sentence["start"] - 0.4), "animation": animation, "weight": 0.35, "speed": 1})
    return gestures, head


def plan_counts(words: list[dict], duration: float) -> list[dict]:
    """Count from spoken word boundaries, including TTS-expanded digits.

    Adjacent counts share a raised wrist and complementary 120 ms fades.
    A count is fully visible at the start of its spoken word.
    """
    names = ["satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh"]
    numbers = {token: number for number, name in enumerate(names, 1)
               for token in (str(number), name, "pertama" if number == 1 else f"ke{name}", f"ke-{number}")}
    tokens = [word["text"].lower().strip(".,!?;:\"'()[]") for word in words]
    magnitudes = {"belas", "puluh", "ratus", "ribu", "juta", "miliar", "triliun", "koma"}
    groups: list[list[dict]] = []
    for index, word in enumerate(words):
        number = numbers.get(tokens[index])
        if not number or word["time"] >= duration:
            continue
        # 'Dua belas' and 'dua puluh satu' must not display two/one fingers.
        if ((index and tokens[index - 1] in magnitudes)
                or (index + 1 < len(tokens) and tokens[index + 1] in magnitudes)):
            continue
        cue = {"number": number, "time": word["time"], "end": min(duration, word["time"] + word["duration"])}
        if not groups or cue["time"] - groups[-1][-1]["end"] > .85:
            groups.append([])
        if groups[-1] and groups[-1][-1]["number"] == number:
            groups[-1][-1]["end"] = cue["end"]
        else:
            groups[-1].append(cue)
    events = []
    for group in groups:
        starts = [max(0, group[0]["time"] - .35)]
        for previous, cue in zip(group, group[1:]):
            # Give the second arm time to rise/lower when crossing five while
            # still reaching the complete finger pose at the spoken word.
            switch_hands = (previous["number"] > 5) != (cue["number"] > 5)
            anticipation = .4 if switch_hands else .12
            starts.append(cue["time"] - min(anticipation, (cue["time"] - previous["time"]) / 2))
        for index, cue in enumerate(group):
            end = group[index + 1]["time"] if index + 1 < len(group) else min(duration, cue["end"] + .45)
            fade_in = max(.001, cue["time"] - starts[index])
            fade_out = end - starts[index + 1] if index + 1 < len(group) else min(.25, max(.001, end - cue["end"]))
            events.append({"start": round(starts[index], 4), "duration": round(end - starts[index], 4),
                           "animation": f"gesture_count_{cue['number']}", "weight": 1, "speed": 1,
                           "fade_in": round(fade_in, 4), "fade_out": round(fade_out, 4)})
    return events
