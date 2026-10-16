"""One request over stdin; audio and real word timings over stdout."""
import asyncio
import base64
import json
import sys

import edge_tts


async def main():
    request = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    text = request["text"]
    rate = float(request.get("rate", 0.95))
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 220:
        raise ValueError("Invalid text")
    if not 0.6 <= rate <= 1.3:
        raise ValueError("Invalid rate")
    speech = edge_tts.Communicate(
        text, "id-ID-ArdiNeural", rate=f"{round((rate - 1) * 100):+d}%",
        pitch="+0Hz", volume="+0%", boundary="WordBoundary",
        connect_timeout=10, receive_timeout=25,
    )
    audio = bytearray()
    words = []
    async for chunk in speech.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            words.append({"text": chunk["text"], "time": chunk["offset"] / 10_000_000,
                          "duration": chunk["duration"] / 10_000_000})
    if not audio:
        raise RuntimeError("No audio received")
    print(json.dumps({"voice": "id-ID-ArdiNeural", "audio": base64.b64encode(audio).decode("ascii"),
                      "words": words}, ensure_ascii=True))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        # No script content or provider internals in logs.
        print(type(error).__name__, file=sys.stderr)
        sys.exit(1)
