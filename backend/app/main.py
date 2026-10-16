from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .api.performance import router, tasks
from .config import GENERATED


@asynccontextmanager
async def lifespan(app):
    yield
    running = list(tasks.values())
    for task in running:
        task.cancel()
    await asyncio.gather(*running, return_exceptions=True)


app = FastAPI(title="AI Avatar Presenter", version="1.0.0", lifespan=lifespan)
app.include_router(router, prefix="/api")
app.mount("/generated", StaticFiles(directory=GENERATED), name="generated")


@app.get("/api/health")
async def health():
    return {"status": "ok", "voice": "id-ID-ArdiNeural", "timeline_version": 1}
