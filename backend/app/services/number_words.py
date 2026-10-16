"""Spoken Indonesian estimates for numeric tokens in TTS word boundaries.

Only used for phonemes: preserve the script, provider timestamps, and numeric
tokens used by captions and count gestures. This is not forced alignment.
"""
import re

DIGITS = ("nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan")
NUMBER = re.compile(r"(?<!\w)(?:ke-)?[+-]?[0-9]+(?:[.,][0-9]+)*(?:\s*%)?(?!\w)", re.IGNORECASE)


def integer_words(value: int) -> str:
    if value < 10:
        return DIGITS[value]
    if value < 20:
        return {10: "sepuluh", 11: "sebelas"}.get(value) or f"{DIGITS[value - 10]} belas"
    if value < 100:
        tens, rest = divmod(value, 10)
        return f"{DIGITS[tens]} puluh" + (f" {integer_words(rest)}" if rest else "")
    for unit, label, special in [(10**12, "triliun", None), (10**9, "miliar", None),
                                 (10**6, "juta", None), (1000, "ribu", "seribu"),
                                 (100, "ratus", "seratus")]:
        if value >= unit:
            count, rest = divmod(value, unit)
            prefix = special if count == 1 and special else f"{integer_words(count)} {label}"
            return prefix + (f" {integer_words(rest)}" if rest else "")
    raise ValueError("Expected a non-negative integer")


def cardinal(digits: str) -> str:
    # Long digit strings and leading-zero identifiers are read digit by digit.
    # Avoid converting unbounded script input into a Python integer.
    if len(digits) > 15 or (len(digits) > 1 and digits.startswith("0")):
        return " ".join(DIGITS[int(digit)] for digit in digits)
    return integer_words(int(digits))


def number_words(token: str) -> str:
    if token.lower().startswith("ke-"):
        value = number_words(token[3:])
        return "pertama" if value == "satu" else f"ke {value}"
    if token.endswith("%"):
        return f"{number_words(token[:-1].rstrip())} persen"
    if token[0] in "+-":
        return f"{'minus' if token[0] == '-' else 'plus'} {number_words(token[1:])}"
    # Indonesian thousands use dots; a comma introduces decimal digits.
    if re.fullmatch(r"[0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]+)?", token):
        token = token.replace(".", "")
    parts = re.split(r"[.,]", token)
    if len(parts) == 1:
        return cardinal(token)
    if len(parts) == 2:
        return f"{cardinal(parts[0])} koma " + " ".join(DIGITS[int(digit)] for digit in parts[1])
    # A provider may return a whole compact list such as '1,2,3' in one token.
    return " ".join(cardinal(part) for part in parts)


def spoken_text(text: str) -> str:
    return NUMBER.sub(lambda match: f" {number_words(match.group())} ", text)
