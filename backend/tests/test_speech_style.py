import asyncio
from types import SimpleNamespace
from unittest.mock import patch
from backend.app.services import tts
from backend.app.api.performance import generate
from backend.app.models.performance import PerformanceJob, PerformanceRequest
from backend.app.services.speech_delivery import conversational_phrases, conversational_prosody


def test_speech_presets_use_provider_timing_and_supported_prosody(tmp_path):
    calls = []
    class FakeSpeech:
        def __init__(self, text, voice, **kwargs):
            calls.append((text, voice, kwargs))
        async def stream(self):
            yield {"type": "audio", "data": b"test-mp3"}
            yield {"type": "WordBoundary", "text": "Halo", "offset": 2_000_000, "duration": 8_000_000}
    with patch.object(tts.edge_tts, "Communicate", FakeSpeech), patch.object(tts, "MP3", return_value=SimpleNamespace(info=SimpleNamespace(length=1.4))):
        for style, rate, pitch, percent in [("normal", .95, "+0Hz", "-5%"), ("relaxed", .85, "-4Hz", "-15%"), ("relaxed", 1.1, "-4Hz", "+10%")]:
            words, duration = asyncio.run(tts.synthesize("Halo.", rate, tmp_path / f"{style}.mp3", speech_style=style))
            assert calls[-1][2]["pitch"] == pitch and calls[-1][2]["rate"] == percent
            assert calls[-1][2]["boundary"] == "WordBoundary"
            assert words == [{"text": "Halo", "time": .2, "duration": .8}]
            assert duration == 1.4


def test_generation_passes_style_to_tts(tmp_path):
    received = []
    async def fake_synthesize(text, rate, path, speech_style="normal"):
        received.append((text, rate, speech_style))
        path.write_bytes(b"audio")
        return [{"text": "Halo", "time": .1, "duration": .6}], 1
    job = PerformanceJob(id="style-test", audio_url="/audio.mp3", timeline_url="/timeline.json", status_url="/status")
    request = PerformanceRequest(text="Halo.", rate=.85, speech_style="relaxed")
    with patch("backend.app.api.performance.GENERATED", tmp_path), patch.object(tts, "synthesize", fake_synthesize):
        asyncio.run(generate(job, request))
    assert job.status == "ready"
    assert received == [("Halo.", .85, "relaxed")]


def test_conversation_keeps_numbers_abbreviations_and_script_words():
    text = "Halo! Dr. Andi menghitung 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100, dan 200. Nilainya 1.250,50.\nKita belajar bersama hari ini, ya?"
    phrases = conversational_phrases(text)
    assert " ".join(phrases) == " ".join(text.split())
    assert any("1.250,50" in phrase for phrase in phrases)
    assert any("Dr. Andi" in phrase for phrase in phrases)
    assert any("1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100, dan 200" in phrase for phrase in phrases)
    assert len(conversational_phrases("Ini kalimat pendek. " * 250)) <= 10
    assert conversational_phrases("Kalimat tanpa tanda baca") == ["Kalimat tanpa tanda baca"]


def test_conversation_offsets_include_complete_audio_and_preserve_provider_words(tmp_path):
    calls = []
    class FakeSpeech:
        def __init__(self, text, voice, **kwargs):
            calls.append((text, kwargs))
        async def stream(self):
            yield {"type": "audio", "data": b"mp3"}
            yield {"type": "WordBoundary", "text": "200", "offset": 2_000_000, "duration": 8_000_000}
    # Each part lasts 1.4s, even though its last word ends at 1s.
    with patch.object(tts.edge_tts, "Communicate", FakeSpeech), patch.object(tts, "MP3", side_effect=[SimpleNamespace(info=SimpleNamespace(length=n)) for n in (1.4, 1.4, 1.4, 4.2)]):
        text = "Halo, hari ini kita akan belajar menghitung bersama teman-teman. Bagaimana kalau kita mencoba menghitung sampai dua ratus bersama? Baik, kita mulai pelan-pelan agar semuanya bisa mengikuti, ya."
        words, duration = asyncio.run(tts.synthesize(text, .95, tmp_path / "conversation.mp3", "conversational"))
    assert len(calls) == 3
    assert [round(word["time"], 4) for word in words] == [.2, 1.6, 3.0]
    assert all(word["text"] == "200" and word["duration"] == .8 for word in words)
    assert duration == 4.2
    assert (tmp_path / "conversation.mp3").read_bytes() == b"mp3mp3mp3"
    assert [call[1]["pitch"] for call in calls] == ["+0Hz", "+2Hz", "-1Hz"]
    assert [call[1]["rate"] for call in calls] == ["-6%", "-3%", "-7%"]


def test_conversation_rate_stays_within_slider_limits():
    assert conversational_prosody("Pertanyaan?", 0, 1, 1.3)[0] == 1.3
    assert conversational_prosody("Penutup.", 1, 2, .6)[0] == .6


def test_conversation_cannot_succeed_with_a_missing_middle_phrase(tmp_path):
    class FakeSpeech:
        calls = 0
        def __init__(self, *args, **kwargs):
            FakeSpeech.calls += 1
        async def stream(self):
            yield {"type": "audio", "data": b"mp3"}
            if FakeSpeech.calls == 1:
                yield {"type": "WordBoundary", "text": "Halo", "offset": 0, "duration": 1_000_000}
    request = PerformanceRequest(text="Kalimat pertama ini cukup panjang agar menjadi kelompok sendiri. Kalimat kedua tidak boleh hilang walau layanan suara bermasalah.", speech_style="conversational")
    job = PerformanceJob(id="missing-phrase", audio_url="/audio.mp3", timeline_url="/timeline.json", status_url="/status")
    with patch("backend.app.api.performance.GENERATED", tmp_path), patch.object(tts.edge_tts, "Communicate", FakeSpeech), patch.object(tts, "MP3", return_value=SimpleNamespace(info=SimpleNamespace(length=1))):
        asyncio.run(generate(job, request))
    assert job.status == "error"
    assert not (tmp_path / "missing-phrase.mp3").exists()
