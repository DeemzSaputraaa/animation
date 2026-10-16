import asyncio
import time
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.api import performance
from backend.app.services import timeline, phoneme, viseme, emotion, gesture


def word_times(text):
    words = text.replace(".", "").replace("?", "").split()
    return [{"text": word, "time": i * 0.55 + 0.1, "duration": 0.45} for i, word in enumerate(words)]


def test_semantics_and_audio_constrained_timeline():
    text = "Selamat datang. Perhatikan bagian yang sangat penting ini. Bagaimana kita dapat belajar bersama?"
    words = word_times(text)
    duration = words[-1]["time"] + 0.65
    data = timeline.build(text, words, duration, "/generated/test.mp3")
    assert data["version"] == 1
    assert [item["emotion"] for item in data["emotion"]] == ["friendly", "serious", "thinking"]
    assert data["sentences"][1]["emphasis"] == ["perhatikan", "sangat penting"]
    assert "estimated" in data["timing_source"]
    for item in data["visemes"]:
        assert 0 <= item["time"] < item["end"] <= duration + 0.000001
    for a, b in zip(data["gestures"], data["gestures"][1:]):
        assert b["start"] - a["start"] >= 2.39
        assert a["animation"] != b["animation"]
    for item in data["gestures"] + data["head"]:
        assert 0 <= item["start"] < item["start"] + item["duration"] <= duration


def test_five_vowels_closures_and_consonant_visemes():
    words = [{"text": "a i u e o m b p f v l w q th ch".split()[i], "time": i, "duration": .8} for i in range(15)]
    sounds = phoneme.generate(words)
    events = viseme.generate(sounds, 16)
    assert set(viseme.VISEMES) - {"rest"} <= {item["viseme"] for item in events}
    assert events[-1]["viseme"] == "rest"
    assert [x["viseme"] for x in events if x["viseme"] != "rest"][:5] == ["A", "I", "U", "E", "O"]


def test_semantic_fallbacks_keep_a_valid_performance():
    text = "Penjelasan materi yang membantu kita memahami informasi secara lengkap."
    with patch.object(emotion, "analyze", side_effect=RuntimeError("offline")), patch.object(gesture, "plan", side_effect=RuntimeError("offline")):
        data = timeline.build(text, word_times(text), 8, "/generated/test.mp3")
    assert all(item["emotion"] == "neutral" for item in data["emotion"])
    assert data["gestures"] and len(data["warnings"]) == 2


def test_numbers_not_found_in_script_keep_spoken_phonemes():
    data = timeline.build("3.", [{"text": "tiga", "time": .1, "duration": .6}], 1, "/generated/test.mp3")
    assert [x["phoneme"] for x in data["phonemes"]] == list("tiga")
    assert data["words"][0]["char_index"] == -1
    assert data["gestures"][0]["animation"] == "gesture_count_3"


def test_counts_follow_spoken_words_and_override_overlapping_gestures():
    for tokens in [("satu", "dua", "tiga"), ("1,", "2,", "3."), ("pertama", "kedua", "ketiga")]:
        words = [{"text": token, "time": 1 + i * .5, "duration": .3} for i, token in enumerate(tokens)]
        data = timeline.build("Kita hitung 1, 2, 3.", words, 3, "/generated/count.mp3")
        events = data["gestures"]
        assert [event["animation"] for event in events] == [f"gesture_count_{i}" for i in (1, 2, 3)]
        for word, event in zip(words, events):
            assert abs(event["start"] + event["fade_in"] - word["time"]) < .0001
            assert 0 <= event["start"] < word["time"] < event["start"] + event["duration"] <= 3
        for previous, event in zip(events, events[1:]):
            assert abs(previous["start"] + previous["duration"] - event["start"] - event["fade_in"]) < .0001
            assert previous["fade_out"] == event["fade_in"]


def test_counts_ignore_larger_numbers_and_hold_repeated_counts():
    for text in ["dua belas", "dua puluh satu", "tiga ratus", "1.25", "12 23 31", "satu koma dua"]:
        assert gesture.plan_counts(word_times(text), 10) == []
    events = gesture.plan_counts(word_times("satu satu dua"), 3)
    assert [event["animation"] for event in events] == ["gesture_count_1", "gesture_count_2"]
    assert events[0]["duration"] > 1
    separated = gesture.plan_counts([{"text": "satu", "time": .1, "duration": .3}, {"text": "tiga", "time": 5, "duration": .3}], 6)
    assert separated[0]["start"] + separated[0]["duration"] < separated[1]["start"]


def test_counts_one_through_ten_and_hand_switch_timing():
    names = "satu dua tiga empat lima enam tujuh delapan sembilan sepuluh".split()
    for tokens in [names, [str(i) for i in range(1, 11)],
                   ["pertama"] + [f"ke{name}" for name in names[1:]],
                   [f"ke-{i}" for i in range(1, 11)], list(reversed(names))]:
        words = word_times(" ".join(tokens))
        data = timeline.build(" ".join(tokens), words, 7, "/generated/count.mp3")
        expected = range(10, 0, -1) if tokens == list(reversed(names)) else range(1, 11)
        assert [event["animation"] for event in data["gestures"]] == [f"gesture_count_{i}" for i in expected]
        for word, event in zip(words, data["gestures"]):
            assert abs(event["start"] + event["fade_in"] - word["time"]) < .0001
            assert 0 <= event["start"] < event["start"] + event["duration"] <= 7
        for previous, event in zip(data["gestures"], data["gestures"][1:]):
            assert abs(previous["fade_out"] - event["fade_in"]) < .0001
        assert data["gestures"][5]["fade_in"] > .12, "Raising/lowering the second hand needs anticipation"
    for text in ["sepuluh ribu", "empat belas", "lima puluh enam", "sembilan koma delapan", "10.5", "11 20 100"]:
        assert gesture.plan_counts(word_times(text), 10) == []


def test_create_poll_ready_and_static_artifacts(tmp_path):
    async def fake_tts(text, rate, path, speech_style="normal"):
        path.write_bytes(b"test-audio")
        return word_times(text), 3.0
    with patch.object(performance, "GENERATED", tmp_path), patch.object(performance.tts, "synthesize", fake_tts), TestClient(app) as client:
        response = client.post("/api/performance", json={"text": "Halo semua.", "language": "id-ID", "voice": "default"})
        assert response.status_code == 202
        job = response.json()
        for _ in range(50):
            status = client.get(job["status_url"]).json()
            if status["status"] != "generating":
                break
            time.sleep(.01)
        assert status["status"] == "ready"
        assert (tmp_path / f"{job['id']}.mp3").exists()
        assert (tmp_path / f"{job['id']}.json").exists()
        assert client.get("/api/performance/missing").status_code == 404
        for invalid in [{"text": " "}, {"text": "x" * 5001}, {"text": "halo", "rate": 9}, {"text": "halo", "voice": "foreign"}, {"text": "halo", "speech_style": "unknown"}]:
            assert client.post("/api/performance", json=invalid).status_code == 422


def test_cancel_stops_generation_and_removes_partial_files(tmp_path):
    async def waiting_tts(text, rate, path, speech_style="normal"):
        path.write_bytes(b"partial")
        await asyncio.sleep(60)
    with patch.object(performance, "GENERATED", tmp_path), patch.object(performance.tts, "synthesize", waiting_tts), TestClient(app) as client:
        job = client.post("/api/performance", json={"text": "Halo."}).json()
        response = client.delete(job["status_url"])
        assert response.status_code == 200
        assert response.json()["status"] == "cancelled"
        assert not list(tmp_path.iterdir())


def test_tts_error_is_reported_without_partial_artifacts(tmp_path):
    async def failed_tts(text, rate, path, speech_style="normal"):
        path.write_bytes(b"partial")
        raise RuntimeError("Provider unavailable")
    with patch.object(performance, "GENERATED", tmp_path), patch.object(performance.tts, "synthesize", failed_tts), TestClient(app) as client:
        job = client.post("/api/performance", json={"text": "Halo."}).json()
        for _ in range(50):
            status = client.get(job["status_url"]).json()
            if status["status"] != "generating":
                break
            time.sleep(.01)
        assert status["status"] == "error"
        assert status["error"]
        assert not list(tmp_path.iterdir())
