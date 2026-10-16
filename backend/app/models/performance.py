from typing import Literal
from pydantic import BaseModel, Field, field_validator


class PerformanceRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    language: Literal["id-ID"] = "id-ID"
    voice: Literal["default", "id-ID-ArdiNeural"] = "default"
    speech_style: Literal["normal", "relaxed", "conversational"] = "normal"
    rate: float = Field(default=0.95, ge=0.6, le=1.3, allow_inf_nan=False)

    @field_validator("text")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Tulis naskah terlebih dahulu.")
        return value


class PerformanceJob(BaseModel):
    id: str
    status: Literal["generating", "ready", "error", "cancelled"] = "generating"
    stage: str = "Menganalisis naskah"
    audio_url: str
    timeline_url: str
    status_url: str
    error: str | None = None
