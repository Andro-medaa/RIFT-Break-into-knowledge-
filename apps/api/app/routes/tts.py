import base64
from fastapi import APIRouter, Response, HTTPException, status
from app.schemas.response import ApiResponse
from app.schemas.tts import (
    TTSRequest,
    TTSResponseMeta,
    TTSPreloadRequest,
    TTSPreloadResponse,
    TTSStatsResponse,
)
from app.teach.emotion import get_tts_params_for_move
from app.providers.tts import tts_engine, AUDIO_CACHE
from app.providers.cache import audio_cache_storage
from app.providers.chatterbox_turbo import chatterbox_turbo_client

router = APIRouter(prefix="/tts", tags=["tts"])


@router.post("", responses={200: {"content": {"audio/wav": {}}}})
def synthesize_speech(payload: TTSRequest) -> Response:
    """Synthesize speech audio WAV bytes for incoming text modulated by pedagogical move.
    Leverages multi-tiered cache (L1 RAM + L2 Disk + L3 R2) and GPU Chatterbox-Turbo worker.
    """
    if not payload.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text must not be empty.",
        )

    emotion = get_tts_params_for_move(payload.move)
    res = tts_engine.synthesize(
        text=payload.text,
        move=payload.move,
        voice=payload.voice or "teacher-charismatic",
        speed=payload.speed or 1.0,
    )

    headers = {
        "Content-Type": "audio/wav",
        "X-Emotion-Exaggeration": str(emotion["exaggeration"]),
        "X-Voice-Move": payload.move,
        "X-Duration-Ms": str(res.duration_ms),
        "X-Cache-Key": res.cache_key,
        "X-Cache": "HIT" if res.cache_hit else "MISS",
        "X-TTS-Engine": res.engine,
    }
    if res.cdn_url:
        headers["X-CDN-Url"] = res.cdn_url

    return Response(
        content=res.wav_bytes,
        media_type="audio/wav",
        headers=headers,
    )


@router.post("/meta", response_model=ApiResponse[TTSResponseMeta])
def synthesize_speech_meta(payload: TTSRequest) -> ApiResponse[TTSResponseMeta]:
    """Synthesize speech and return JSON metadata with base64 audio payload and cache status."""
    if not payload.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text must not be empty.",
        )

    emotion = get_tts_params_for_move(payload.move)
    res = tts_engine.synthesize(
        text=payload.text,
        move=payload.move,
        voice=payload.voice or "teacher-charismatic",
        speed=payload.speed or 1.0,
    )

    b64_str = base64.b64encode(res.wav_bytes).decode("ascii")

    meta = TTSResponseMeta(
        cache_key=res.cache_key,
        duration_ms=res.duration_ms,
        move=payload.move,
        exaggeration=float(emotion["exaggeration"]),
        speed=float(payload.speed or 1.0),
        format="audio/wav",
        audio_base64=b64_str,
        cache_hit=res.cache_hit,
        engine_used=res.engine,
        cdn_url=res.cdn_url,
    )

    hit_label = "cached" if res.cache_hit else f"newly synthesized via {res.engine}"
    return ApiResponse(
        success=True,
        data=meta,
        message=f"Audio ready ({hit_label}, {res.duration_ms}ms) with {payload.move} emotion (exaggeration {emotion['exaggeration']}).",
    )


@router.get("/cache/{cache_key}")
def get_cached_audio(cache_key: str) -> Response:
    """Retrieve pre-rendered audio buffer from multi-tiered cache by cache key."""
    cached = audio_cache_storage.get(cache_key)
    if cached is None:
        if cache_key not in AUDIO_CACHE:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Audio not found in cache.",
            )
        wav_bytes, duration_ms = AUDIO_CACHE[cache_key]
        tier = "legacy_memory"
    else:
        wav_bytes, duration_ms, tier = cached

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Content-Type": "audio/wav",
            "X-Duration-Ms": str(duration_ms),
            "X-Cache-Key": cache_key,
            "X-Cache": "HIT",
            "X-Cache-Tier": tier,
        },
    )


@router.post("/preload", response_model=ApiResponse[TTSPreloadResponse])
def preload_lesson_audio(payload: TTSPreloadRequest) -> ApiResponse[TTSPreloadResponse]:
    """Pre-cache a batch of lesson sentences asynchronously or ahead of time.
    Ensures subsequent lesson playback or replaying has sub-millisecond response latency.
    """
    cache_keys = []
    total_duration_ms = 0

    for item in payload.items:
        res = tts_engine.synthesize(
            text=item.text,
            move=item.move,
            voice=item.voice or "teacher-charismatic",
            speed=item.speed or 1.0,
        )
        cache_keys.append(res.cache_key)
        total_duration_ms += res.duration_ms

    return ApiResponse(
        success=True,
        data=TTSPreloadResponse(
            preloaded_count=len(cache_keys),
            cache_keys=cache_keys,
            total_duration_ms=total_duration_ms,
        ),
        message=f"Preloaded {len(cache_keys)} sentences into audio cache ({total_duration_ms}ms total duration).",
    )


@router.get("/stats", response_model=ApiResponse[TTSStatsResponse])
def get_tts_cache_stats() -> ApiResponse[TTSStatsResponse]:
    """Retrieve audio cache performance stats, storage tier status, and GPU worker availability."""
    stats = audio_cache_storage.stats()
    gpu_available = chatterbox_turbo_client.is_available()

    response_data = TTSStatsResponse(
        total_cached_items=stats["total_cached_items"],
        cache_hits=stats["cache_hits"],
        cache_misses=stats["cache_misses"],
        hit_rate=stats["hit_rate"],
        storage_backend=stats["storage_backend"],
        gpu_worker_available=gpu_available,
        gpu_worker_url=chatterbox_turbo_client.base_url or None,
    )

    return ApiResponse(
        success=True,
        data=response_data,
        message="TTS cache performance and GPU worker statistics retrieved successfully.",
    )
