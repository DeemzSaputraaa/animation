import asyncio
from unittest.mock import patch

import aiohttp
import edge_tts
import pytest

from backend.app.api import performance
from backend.app.models.performance import PerformanceJob, PerformanceRequest
from backend.app.services import tts


@pytest.mark.parametrize("error, expected", [
    (aiohttp.WSServerHandshakeError(None, (), status=403), "menolak permintaan (403)"),
    (aiohttp.ClientResponseError(None, (), status=429), "membatasi permintaan (429)"),
    (aiohttp.ClientResponseError(None, (), status=503), "HTTP 503"),
    (asyncio.TimeoutError(), "terlalu lama"),
    (aiohttp.ClientConnectionError("private details"), "Periksa koneksi internet"),
    (edge_tts.exceptions.NoAudioReceived("private details"), "tidak mengembalikan audio"),
])
def test_provider_failure_has_actionable_message_and_cleans_partial_audio(tmp_path, caplog, error, expected):
    class FailedSpeech:
        def __init__(self, *args, **kwargs):
            pass

        async def stream(self):
            yield {"type": "audio", "data": b"partial"}
            raise error

    job = PerformanceJob(id="failure", audio_url="/audio.mp3", timeline_url="/timeline.json", status_url="/status")
    with patch.object(performance, "GENERATED", tmp_path), patch.object(tts.edge_tts, "Communicate", FailedSpeech):
        asyncio.run(performance.generate(job, PerformanceRequest(text="Halo.")))
    assert job.status == "error"
    assert expected in job.error
    assert "private details" not in job.error
    assert not list(tmp_path.iterdir())
    assert any(record.exc_info and "Membuat suara" in record.getMessage() for record in caplog.records)


def test_timeline_failure_does_not_blame_the_network(tmp_path, caplog):
    async def fake_tts(text, rate, path, speech_style="normal"):
        path.write_bytes(b"audio")
        return [{"text": "Halo", "time": 0, "duration": .5}], 1

    job = PerformanceJob(id="timeline-failure", audio_url="/audio.mp3", timeline_url="/timeline.json", status_url="/status")
    with patch.object(performance, "GENERATED", tmp_path), patch.object(tts, "synthesize", fake_tts), patch.object(performance.timeline, "build", side_effect=ValueError("invalid timeline")):
        asyncio.run(performance.generate(job, PerformanceRequest(text="Halo.")))
    assert job.status == "error"
    assert "Menyusun animasi" in job.error
    assert "internet" not in job.error
    assert not list(tmp_path.iterdir())
    assert "invalid timeline" in caplog.text
