"""Speech-to-Text (STT) route using Gemini Flash for robust speech transcription with noise/echo rejection."""

from fastapi import APIRouter, File, UploadFile, HTTPException
from pydantic import BaseModel
from google import genai
from google.genai import types

from app.core.config import setting
from app.core.logger import get_logger
from app.schemas.response import ApiResponse

logger = get_logger("app.routes.stt")
router = APIRouter(prefix="/api/stt", tags=["Speech-to-Text"])


class TranscriptionResponse(BaseModel):
    text: str
    confidence: float = 1.0


@router.post("/transcribe", response_model=ApiResponse[TranscriptionResponse])
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe an uploaded audio blob (webm, wav, mp3, ogg, etc.) using Gemini Flash.
    
    Discards noise, echo, static, and ambient disturbance.
    """
    if not setting.gemini_api_key:
        raise HTTPException(status_code=500, detail="Gemini API key is not configured.")

    try:
        audio_bytes = await file.read()
        if not audio_bytes or len(audio_bytes) < 100:
            return ApiResponse(
                data=TranscriptionResponse(text=""),
                message="Audio file is empty or too short",
            )

        mime_type = file.content_type or "audio/webm"
        # Normalize mime type for common audio containers
        if "webm" in mime_type:
            mime_type = "audio/webm"
        elif "wav" in mime_type:
            mime_type = "audio/wav"
        elif "mp4" in mime_type or "m4a" in mime_type:
            mime_type = "audio/mp4"
        elif "ogg" in mime_type:
            mime_type = "audio/ogg"

        client = genai.Client(api_key=setting.gemini_api_key)
        audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)

        prompt = (
            "Transcribe the spoken voice in this audio clip clearly and accurately. "
            "Filter out and ignore all background noise, fan hums, room echoes, static, or other non-speech human sounds. "
            "Output ONLY the transcribed spoken words. Do not add any preamble, quotes, explanations, or punctuation tags. "
            "If no speech is detected, output nothing."
        )

        for model_name in ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"]:
            try:
                resp = await client.aio.models.generate_content(
                    model=model_name,
                    contents=[prompt, audio_part],
                )
                transcribed = (resp.text or "").strip()
                # Remove surrounding quotes if Gemini wraps the transcription
                if (transcribed.startswith('"') and transcribed.endswith('"')) or (
                    transcribed.startswith("'") and transcribed.endswith("'")
                ):
                    transcribed = transcribed[1:-1].strip()

                # Filter out standard hallucinations on quiet/ambient clips
                hallucinations = {
                    "thank you", "thank you.", "thanks", "thanks.", "you", "you.",
                    "bye", "bye.", "okay", "okay.", "so", "so.", "subtitles by", "watching",
                    "yeah", "yeah.", "hello", "hello."
                }
                if transcribed.lower().strip() in hallucinations and len(audio_bytes) < 15000:
                    transcribed = ""

                logger.info(f"Gemini STT ({model_name}) transcribed {len(audio_bytes)} bytes -> {transcribed!r}")
                return ApiResponse(
                    data=TranscriptionResponse(text=transcribed),
                    message="Speech successfully transcribed",
                )
            except Exception as model_err:
                logger.warning(f"Gemini {model_name} STT attempt error: {model_err}")

        raise HTTPException(status_code=502, detail="All Gemini STT models failed to process audio.")

    except Exception as e:
        logger.error(f"Audio transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

