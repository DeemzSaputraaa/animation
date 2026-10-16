from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "generated"
GENERATED.mkdir(exist_ok=True)
VOICE = "id-ID-ArdiNeural"
MAX_JOBS = 2
