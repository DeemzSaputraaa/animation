from copy import deepcopy
import pytest
from backend.app.services import phoneme, timeline, viseme
from backend.app.services.number_words import spoken_text


@pytest.mark.parametrize("numeric,spoken", [
    ("0", "nol"), ("1", "satu"), ("2", "dua"), ("3", "tiga"), ("4", "empat"),
    ("5", "lima"), ("6", "enam"), ("7", "tujuh"), ("8", "delapan"), ("9", "sembilan"),
    ("10", "sepuluh"), ("11", "sebelas"), ("12", "dua belas"), ("21", "dua puluh satu"),
    ("100", "seratus"), ("200", "dua ratus"), ("201", "dua ratus satu"),
    ("999", "sembilan ratus sembilan puluh sembilan"), ("1000", "seribu"),
    ("2026", "dua ribu dua puluh enam"), ("1000000", "satu juta"),
    ("1234567", "satu juta dua ratus tiga puluh empat ribu lima ratus enam puluh tujuh"),
    ("1000000000", "satu miliar"), ("1000000000000", "satu triliun"),
    ("1.000", "seribu"), ("1.250,05", "seribu dua ratus lima puluh koma nol lima"),
    ("0,5", "nol koma lima"), ("-200", "minus dua ratus"), ("25%", "dua puluh lima persen"),
    ("ke-1", "pertama"), ("ke-10", "ke sepuluh"), ("007", "nol nol tujuh"),
])
def test_numeric_lips_match_spelled_words_without_changing_timestamps(numeric, spoken):
    assert spoken_text(numeric).strip() == spoken
    words = [{"text": numeric, "time": .5, "duration": 1.8}]
    original = deepcopy(words)
    expected = phoneme.generate([{**words[0], "text": spoken}])
    actual = phoneme.generate(words)
    assert actual == expected
    assert words == original
    assert actual[0]["start"] == .5 and actual[-1]["end"] == 2.3
    assert any(event["viseme"] in "AEIOU" for event in viseme.generate(actual, 3))


def test_number_lists_keep_lips_inside_audio_and_preserve_hand_counts():
    tokens = [str(i) for i in range(1, 11)] + ["200", "100", "1250"]
    text = ",".join(tokens) + "."
    words = [{"text": token, "time": i * 1.5 + .1, "duration": 1.2} for i, token in enumerate(tokens)]
    duration = words[-1]["time"] + 1.4
    data = timeline.build(text, words, duration, "/generated/numbers.mp3")
    for word in data["words"]:
        start, end = word["time"], word["time"] + word["duration"]
        sounds = [item for item in data["phonemes"] if start <= item["start"] < end]
        assert sounds and sounds[-1]["end"] <= end + 1e-6
        mouth = [item for item in data["visemes"] if start <= item["time"] < end and item["viseme"] != "rest"]
        assert mouth, f"Mouth must move for {word['text']}"
        assert text[word["char_index"]:word["char_index"] + len(word["text"])] == word["text"]
    assert all(0 <= item["time"] < item["end"] <= duration for item in data["visemes"])
    assert [event["animation"] for event in data["gestures"] if event["animation"].startswith("gesture_count_")] == [f"gesture_count_{i}" for i in range(1, 11)]


def test_overlapping_word_durations_do_not_overlap_number_phonemes():
    words = [{"text": "200", "time": 0, "duration": 2}, {"text": "100", "time": 1, "duration": 1}]
    sounds = phoneme.generate(words)
    assert all(a["end"] <= b["start"] for a, b in zip(sounds, sounds[1:]))
    assert sounds[-1]["end"] == 2
    assert spoken_text("1,2,3").strip() == "satu dua tiga"
