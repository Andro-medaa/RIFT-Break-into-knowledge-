from pydantic import BaseModel, Field
from typing import Optional

class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Spoken text to synthesize")
    move: str = Field(default="explain", description="Pedagogical move (intro, explain, example, analogy, recap, check)")
    voice: Optional[str] = Field(default="teacher-charismatic", description="Voice profile name")
    speed: Optional[float] = Field(default=1.0, ge=0.5, le=2.0, description="Playback speed multiplier")

class TTSResponseMeta(BaseModel):
    cache_key: str
    duration_ms: int
    move: str
    exaggeration: float
    speed: float
    format: str = "audio/wav"
    audio_base64: Optional[str] = None
