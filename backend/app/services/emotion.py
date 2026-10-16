"""Transparent, deterministic MVP semantic rules; no external LLM required."""
import re

RULES = [
    ("concerned", r"\b(risiko|khawatir|sedih|bahaya|masalah|kecewa)\b", 0.35),
    ("excited", r"\b(luar biasa|hebat|menakjubkan|semangat|antusias)\b", 0.85),
    ("happy", r"\b(senang|bahagia|gembira|berhasil|selamat)\b", 0.65),
    ("friendly", r"\b(selamat datang|halo|hai|terima kasih|salam)\b", 0.55),
    ("serious", r"\b(penting|wajib|harus|perhatikan|ingat)\b", 0.45),
    ("thinking", r"\b(mengapa|bagaimana|mungkin|pikir|pertimbangkan|apakah)\b", 0.4),
]


def analyze(text: str) -> dict:
    lowered = text.lower()
    # A welcome is friendly even though it contains 'selamat'.
    if "selamat datang" in lowered:
        emotion, energy = "friendly", 0.55
    else:
        emotion, energy = "neutral", 0.45
        for label, pattern, strength in RULES:
            if re.search(pattern, lowered):
                emotion, energy = label, strength
                break
    emphasis = [m.group() for m in re.finditer(r"sangat penting|luar biasa|perhatikan|ingat|harus|pertama|kedua|ketiga", lowered)]
    return {"emotion": emotion, "energy": energy, "emphasis": emphasis}


def segment(text: str) -> list[dict]:
    # Keep newlines and punctuation boundaries without reading list markers as sentences.
    result = []
    for match in re.finditer(r"[^.!?\n]+(?:[.!?]+|$|(?=\n))", text):
        sentence = match.group().strip()
        if not sentence:
            continue
        offset = match.start() + len(match.group()) - len(match.group().lstrip())
        result.append({"text": sentence, "char_start": offset, "char_end": offset + len(sentence)})
    return result or [{"text": text, "char_start": 0, "char_end": len(text)}]
