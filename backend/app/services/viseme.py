VISEMES = ["rest", "A", "E", "I", "O", "U", "MBP", "FV", "L", "WQ", "TH", "CH"]


def name(sound: str) -> str:
    if sound in ("a", "e", "i", "o", "u"):
        return sound.upper()
    if sound in ("m", "b", "p"):
        return "MBP"
    if sound in ("f", "v"):
        return "FV"
    if sound in ("l", "n", "t", "d"):
        return "L"
    if sound in ("w", "q"):
        return "WQ"
    if sound == "th":
        return "TH"
    if sound in ("ch", "c", "j", "sy", "s", "z"):
        return "CH"
    if sound == "y":
        return "I"
    return "rest"


def generate(phonemes: list[dict], duration: float) -> list[dict]:
    result = []
    previous_end = 0.0
    for item in phonemes:
        start, end = item["start"], item["end"]
        if start > previous_end + 0.001:
            result.append({"time": previous_end, "end": start, "viseme": "rest", "weight": 0})
        label = name(item["phoneme"])
        result.append({"time": start, "end": end, "viseme": label, "weight": 0 if label == "rest" else 1})
        previous_end = end
    if previous_end < duration:
        result.append({"time": previous_end, "end": duration, "viseme": "rest", "weight": 0})
    return result
