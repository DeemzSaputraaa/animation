"""Indonesian grapheme-to-phoneme estimates constrained by real TTS word timing.

The provider exposes word boundaries, not phoneme alignment. The timeline
records this distinction so estimated timings are never presented as measured.
"""
import re
import unicodedata
from .number_words import spoken_text


def generate(words: list[dict]) -> list[dict]:
    result = []
    for index, word in enumerate(words):
        text = "".join(c for c in unicodedata.normalize("NFD", spoken_text(word["text"]).lower()) if not unicodedata.combining(c))
        sounds = re.findall(r"ng|ny|sy|kh|th|ch|[a-z]", text)
        start = word["time"]
        end = min(start + word["duration"], words[index + 1]["time"] if index + 1 < len(words) else float("inf"))
        if not sounds or end <= start:
            continue
        weights = [1.9 if s in "aiueo" else 0.9 if s in "mbp" else 0.65 for s in sounds]
        unit = (end - start) / sum(weights)
        for sound, weight in zip(sounds, weights):
            finish = start + unit * weight
            result.append({"start": round(start, 6), "end": round(finish, 6), "phoneme": sound})
            start = finish
    return result
