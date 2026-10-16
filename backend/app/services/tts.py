import asyncio
from io import BytesIO
import aiohttp
import edge_tts
from mutagen.mp3 import MP3
from ..config import VOICE
from .speech_delivery import conversational_phrases, conversational_prosody


class SpeechSynthesisError(RuntimeError):
    """A provider failure with a message safe to show in the UI."""


async def synthesize(text: str, rate: float, path, speech_style: str = "normal") -> tuple[list[dict], float]:
    phrases = conversational_phrases(text) if speech_style == "conversational" else [text]
    words = []
    async def stream_audio():
        elapsed = 0.0
        with path.open("wb") as audio:
            for index, phrase in enumerate(phrases):
                phrase_rate, pitch = rate, "-4Hz" if speech_style == "relaxed" else "+0Hz"
                if speech_style == "conversational":
                    phrase_rate, pitch = conversational_prosody(phrase, index, len(phrases), rate)
                speech = edge_tts.Communicate(phrase, VOICE,
                    rate=f"{round((phrase_rate - 1) * 100):+d}%", pitch=pitch, volume="+0%",
                    boundary="WordBoundary", connect_timeout=10, receive_timeout=45)
                data, phrase_words = bytearray(), []
                async for chunk in speech.stream():
                    if chunk["type"] == "audio":
                        data.extend(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        phrase_words.append({"text": chunk["text"], "time": elapsed + chunk["offset"] / 10_000_000,
                                             "duration": chunk["duration"] / 10_000_000})
                if not data or not phrase_words:
                    raise SpeechSynthesisError("Layanan suara tidak mengembalikan audio dan waktu kata. Coba lagi.")
                # edge-tts emits concatenable 24 kHz / 48 kbps CBR MP3
                # frames and itself joins streams this way. Include the entire
                # audio duration (including trailing silence) in word offsets.
                elapsed += MP3(BytesIO(data)).info.length
                audio.write(data)
                words.extend(phrase_words)
    try:
        await asyncio.wait_for(stream_audio(), timeout=180)
    except asyncio.TimeoutError as exc:
        raise SpeechSynthesisError("Layanan suara terlalu lama merespons. Coba lagi atau pendekkan naskah.") from exc
    except aiohttp.ClientResponseError as exc:
        if exc.status == 403:
            message = "Layanan suara Microsoft menolak permintaan (403). Perbarui dependensi backend lalu mulai ulang server."
        elif exc.status == 429:
            message = "Layanan suara sedang membatasi permintaan (429). Tunggu sebentar lalu coba lagi."
        else:
            message = f"Layanan suara mengembalikan error HTTP {exc.status}. Coba lagi nanti."
        raise SpeechSynthesisError(message) from exc
    except aiohttp.ClientConnectionError as exc:
        raise SpeechSynthesisError("Tidak dapat terhubung ke layanan suara. Periksa koneksi internet lalu coba lagi.") from exc
    except edge_tts.exceptions.EdgeTTSException as exc:
        raise SpeechSynthesisError("Layanan suara tidak mengembalikan audio dan waktu kata yang valid. Coba lagi nanti.") from exc
    if not words or not path.stat().st_size:
        raise SpeechSynthesisError("Layanan suara tidak mengembalikan audio dan waktu kata. Coba lagi.")
    duration = MP3(path).info.length
    return words, duration
