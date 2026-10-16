"""Small, deterministic prosody changes at complete sentence boundaries."""
import math
import re


def conversational_phrases(text: str) -> list[str]:
    # Keep numbers, decimal separators, abbreviations and short greetings together.
    # A maximum of ten provider calls also bounds latency for a 5,000-char script.
    target = max(60, math.ceil(len(text) / 10))
    phrases, pending = [], []
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text.strip()):
        if not sentence:
            continue
        pending.append(sentence)
        phrase = " ".join(pending)
        abbreviated = re.search(r"(?:\b(?:dr|prof|bpk|ibu|sdr|no|dll|dst|dsb)|\b[A-Z]|\d)\.$", sentence, re.I)
        if len(phrase) >= target and not abbreviated and len(phrases) < 9:
            phrases.append(phrase)
            pending = []
    if pending:
        phrases.append(" ".join(pending))
    return phrases


def conversational_prosody(phrase: str, index: int, count: int, rate: float) -> tuple[float, str]:
    # The voice already handles punctuation. Only nudge whole phrases: no random
    # word-level changes, inserted filler words or artificial laughter/breaths.
    ending = phrase.rstrip(' \"\u201d\u2019')
    if ending.endswith("?"):
        adjustment, pitch = .02, "+2Hz"
    elif ending.endswith("!"):
        adjustment, pitch = .01, "+1Hz"
    elif count > 1 and index == count - 1:
        adjustment, pitch = -.02, "-1Hz"
    elif index == 0:
        adjustment, pitch = -.01, "+0Hz"
    else:
        adjustment, pitch = 0, "+0Hz"
    return max(.6, min(1.3, rate + adjustment)), pitch
