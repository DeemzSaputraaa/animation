import asyncio
import json
import logging
import uuid
from fastapi import APIRouter, HTTPException
from ..config import GENERATED, MAX_JOBS
from ..models.performance import PerformanceJob, PerformanceRequest
from ..services import timeline, tts

router = APIRouter()
logger = logging.getLogger(__name__)
jobs: dict[str, PerformanceJob] = {}
tasks: dict[str, asyncio.Task] = {}


async def generate(job: PerformanceJob, request: PerformanceRequest):
    audio_path = GENERATED / f"{job.id}.mp3"
    timeline_path = GENERATED / f"{job.id}.json"
    try:
        job.stage = "Menganalisis naskah"
        sentences, warnings = timeline.analyze_script(request.text)
        job.stage = "Membuat suara"
        words, duration = await tts.synthesize(request.text, request.rate, audio_path, speech_style=request.speech_style)
        job.stage = "Menyusun animasi"
        result = timeline.build(request.text, words, duration, job.audio_url, sentences, warnings)
        timeline_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        job.status, job.stage = "ready", "Siap diputar"
    except asyncio.CancelledError:
        job.status, job.stage = "cancelled", "Pembuatan dibatalkan"
    except Exception as exc:
        failed_stage = job.stage
        logger.exception("Performance %s failed during %s", job.id, failed_stage)
        job.status, job.stage = "error", "Gagal membuat performa"
        if isinstance(exc, tts.SpeechSynthesisError):
            job.error = str(exc)
        else:
            job.error = f"Performa gagal pada tahap: {failed_stage}. Coba lagi; jika berulang, periksa log backend."
    finally:
        if job.status != "ready":
            audio_path.unlink(missing_ok=True)
            timeline_path.unlink(missing_ok=True)
        tasks.pop(job.id, None)


@router.post("/performance", response_model=PerformanceJob, status_code=202)
async def create_performance(request: PerformanceRequest):
    if len(tasks) >= MAX_JOBS:
        raise HTTPException(429, "Layanan sedang sibuk. Coba lagi setelah proses lain selesai.")
    # Bound session metadata; completed artifacts remain addressable by their URLs.
    if len(jobs) >= 100:
        for key in list(jobs):
            if key not in tasks:
                jobs.pop(key)
                break
    identifier = f"performance_{uuid.uuid4().hex}"
    job = PerformanceJob(id=identifier, audio_url=f"/generated/{identifier}.mp3",
                         timeline_url=f"/generated/{identifier}.json", status_url=f"/api/performance/{identifier}")
    jobs[identifier] = job
    tasks[identifier] = asyncio.create_task(generate(job, request))
    return job


@router.get("/performance/{identifier}", response_model=PerformanceJob)
async def status(identifier: str):
    if identifier not in jobs:
        raise HTTPException(404, "Sesi tidak ditemukan. Silakan buat performa kembali.")
    return jobs[identifier]


@router.delete("/performance/{identifier}", response_model=PerformanceJob)
async def cancel(identifier: str):
    job = await status(identifier)
    task = tasks.get(identifier)
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            job.status, job.stage = "cancelled", "Pembuatan dibatalkan"
            tasks.pop(identifier, None)
    return job
