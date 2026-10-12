import base64
from fastapi import APIRouter, Response, HTTPException, status
from app.schemas.response import ApiResponse
from app.schemas.tts import TTSRequest, TTSResponseMeta
from app.teach.emotion import get_tts_params_for_move
from app.providers.tts import tts_engine, AUDIO_CACHE

router = APIRouter(prefix="/tts", tags=["tts"])


@router.post("", responses={200: {"content": {"audio/wav": {}}}})
def synthesize_speech(payload: TTSRequest) -> Response:
    """Synthesize speech audio WAV bytes for incoming text modulated by pedagogical move."""
    if not payload.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text must not be empty.",
        )

    emotion = get_tts_params_for_move(payload.move)
    wav_bytes, duration_ms, cache_key = tts_engine.synthesize(
        text=payload.text,
        move=payload.move,
        voice=payload.voice or "teacher-charismatic",
        speed=payload.speed or 1.0,
    )

    headers = {
        "Content-Type": "audio/wav",
        "X-Emotion-Exaggeration": str(emotion["exaggeration"]),
        "X-Voice-Move": payload.move,
        "X-Duration-Ms": str(duration_ms),
        "X-Cache-Key": cache_key,
    }

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers=headers,
    )


@router.post("/meta", response_model=ApiResponse[TTSResponseMeta])
def synthesize_speech_meta(payload: TTSRequest) -> ApiResponse[TTSResponseMeta]:
    """Synthesize speech and return JSON metadata with base64 audio payload."""
    if not payload.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text must not be empty.",
        )

    emotion = get_tts_params_for_move(payload.move)
    wav_bytes, duration_ms, cache_key = tts_engine.synthesize(
        text=payload.text,
        move=payload.move,
        voice=payload.voice or "teacher-charismatic",
        speed=payload.speed or 1.0,
    )

    b64_str = base64.b64encode(wav_bytes).decode("ascii")

    meta = TTSResponseMeta(
        cache_key=cache_key,
        duration_ms=duration_ms,
        move=payload.move,
        exaggeration=float(emotion["exaggeration"]),
        speed=float(payload.speed or 1.0),
        format="audio/wav",
        audio_base64=b64_str,
    )

    return ApiResponse(
        success=True,
        data=meta,
        message=f"Synthesized {duration_ms}ms audio with {payload.move} emotion (exaggeration {emotion['exaggeration']}).",
    )


@router.get("/cache/{cache_key}")
def get_cached_audio(cache_key: str) -> Response:
    """Retrieve pre-rendered audio buffer by cache key."""
    if cache_key not in AUDIO_CACHE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio not found in cache.",
        )

    wav_bytes, duration_ms = AUDIO_CACHE[cache_key]
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Content-Type": "audio/wav",
            "X-Duration-Ms": str(duration_ms),
            "X-Cache-Key": cache_key,
        },
    )
