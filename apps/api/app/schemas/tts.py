from typing import Optional, List
from pydantic import BaseModel, Field

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
    cache_hit: bool = False
    engine_used: str = "harmonic-acoustic"
    cdn_url: Optional[str] = None

class TTSPreloadItem(BaseModel):
    text: str = Field(..., min_length=1)
    move: str = Field(default="explain")
    voice: Optional[str] = Field(default="teacher-charismatic")
    speed: Optional[float] = Field(default=1.0)

class TTSPreloadRequest(BaseModel):
    items: List[TTSPreloadItem] = Field(..., min_length=1, description="List of sentences to pre-cache")

class TTSPreloadResponse(BaseModel):
    preloaded_count: int
    cache_keys: List[str]
    total_duration_ms: int

class TTSStatsResponse(BaseModel):
    total_cached_items: int
    cache_hits: int
    cache_misses: int
    hit_rate: float
    storage_backend: str
    gpu_worker_available: bool
    gpu_worker_url: Optional[str] = None
