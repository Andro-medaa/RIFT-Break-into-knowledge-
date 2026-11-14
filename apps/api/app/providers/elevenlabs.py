"""ElevenLabs TTS provider with character-to-word alignment timestamps and zero-cost disk caching."""

import base64
import hashlib
import json
import time
from pathlib import Path
from typing import Any, Optional
import httpx

from app.core.config import setting
from app.core.logger import get_logger

logger = get_logger("app.providers.elevenlabs")

DEFAULT_VOICE_ID = "hpp4J3VqNfWAUOO0d1Us"  # Bella (Soft & Gentle)
DEFAULT_MODEL_ID = "eleven_multilingual_v2"

PRESET_VOICES = [
    {
        "voice_id": "hpp4J3VqNfWAUOO0d1Us",
        "name": "Bella",
        "description": "Female (Soft & Gentle)",
        "category": "premade",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/hpp4J3VqNfWAUOO0d1Us/dab0f5ba-3aa4-48a8-9fad-f138fea1126d.mp3",
    },
    {
        "voice_id": "EXAVITQu4vr4xnSDxMaL",
        "name": "Sarah",
        "description": "Female (Soft & Expressive)",
        "category": "premade",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/01a3e33c-6e99-4ee7-8543-ff2216a32186.mp3",
    },
    {
        "voice_id": "pFZP5JQG7iQjIQuC4Bku",
        "name": "Lily",
        "description": "Female (Velvety Actress, British)",
        "category": "premade",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/pFZP5JQG7iQjIQuC4Bku/89b68b35-b3dd-4348-a84a-a3c13a3c2b30.mp3",
    },
    {
        "voice_id": "cgSgspJ2msm6clMCkdW9",
        "name": "Jessica",
        "description": "Female (Playful, Bright & Warm)",
        "category": "premade",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/cgSgspJ2msm6clMCkdW9/56a97bf8-b69b-448f-846c-c3a11683d45a.mp3",
    },
    {
        "voice_id": "pNInz6obpgDQGcFmaJgB",
        "name": "Adam",
        "description": "Male (Deep & Grounded)",
        "category": "premade",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3",
    },
    {
        "voice_id": "bIHbv24MWmeRgasZH58o",
        "name": "Will",
        "description": "Male (Relaxed Optimist)",
        "category": "premade",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/bIHbv24MWmeRgasZH58o/8caf8f3d-ad29-4980-af41-53f20c72d7a4.mp3",
    },
    {
        "voice_id": "SOYHLrjzK2X1ezoPC6cr",
        "name": "Harry",
        "description": "Male (Fierce & Character)",
        "category": "premade",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/SOYHLrjzK2X1ezoPC6cr/86d178f6-f4b6-4e0e-85be-3de19f490794.mp3",
    },
    {
        "voice_id": "cjVigY5qzO86Huf0OWal",
        "name": "Eric",
        "description": "Male (Smooth & Trustworthy)",
        "category": "premade",
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/cjVigY5qzO86Huf0OWal/d098fda0-6456-4030-b3d8-63aa048c9070.mp3",
    },
]


class ElevenLabsProvider:
    """Manages synthesis with ElevenLabs, word timestamp aggregation, and disk-level caching."""

    def __init__(self):
        self.cache_dir = Path(setting.AUDIO_CACHE_DIR) / "elevenlabs"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._cached_voices: Optional[list[dict[str, Any]]] = None
        self._voices_cached_at: float = 0.0

    def _get_cache_key(self, text: str, voice_id: str, model_id: str) -> str:
        """Deterministic SHA256 cache key."""
        payload = f"{text.strip()}|{voice_id}|{model_id}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _aggregate_word_timestamps(self, alignment: dict[str, Any]) -> list[dict[str, Any]]:
        """Aggregate character-level timestamps to word-level timestamps."""
        chars = alignment.get("characters", [])
        starts = alignment.get("character_start_times_seconds", [])
        ends = alignment.get("character_end_times_seconds", [])

        if not chars or not starts or not ends:
            return []

        words: list[dict[str, Any]] = []
        current_word = ""
        word_start: Optional[float] = None

        for i, char in enumerate(chars):
            if word_start is None:
                word_start = starts[i]

            if char in (" ", "\n", "\t"):
                if current_word:
                    end_time = ends[i - 1] if i > 0 else ends[0]
                    words.append({
                        "word": current_word,
                        "start": round(word_start, 3),
                        "end": round(end_time, 3),
                    })
                    current_word = ""
                    word_start = None
            else:
                current_word += char

        if current_word and word_start is not None:
            words.append({
                "word": current_word,
                "start": round(word_start, 3),
                "end": round(ends[-1], 3),
            })

        return words

    async def list_voices(self) -> list[dict[str, Any]]:
        """List available voices from ElevenLabs or return high-quality presets."""
        now = time.time()
        if self._cached_voices and (now - self._voices_cached_at < 3600):
            return self._cached_voices

        api_key = setting.elevenlabs_api_key
        if not api_key:
            return PRESET_VOICES

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    "https://api.elevenlabs.io/v1/voices",
                    headers={"xi-api-key": api_key},
                )
                if res.status_code == 200:
                    data = res.json()
                    api_voices = data.get("voices", [])
                    seen_ids = set()
                    merged = []
                    for pv in PRESET_VOICES:
                        seen_ids.add(pv["voice_id"])
                        merged.append(pv)
                    for v in api_voices:
                        vid = v.get("voice_id")
                        if vid and vid not in seen_ids:
                            seen_ids.add(vid)
                            merged.append({
                                "voice_id": vid,
                                "name": v.get("name", "Unnamed"),
                                "description": v.get("description") or v.get("category", "Voice"),
                                "category": v.get("category", "general"),
                                "preview_url": v.get("preview_url"),
                            })
                    self._cached_voices = merged
                    self._voices_cached_at = now
                    return merged
        except Exception as e:
            logger.warning(f"Error fetching ElevenLabs voices: {e}")

        return PRESET_VOICES

    async def synthesize(
        self,
        text: str,
        voice_id: Optional[str] = None,
        model_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Synthesize text into speech with word-level timestamps and disk caching."""
        vid = voice_id or DEFAULT_VOICE_ID
        mid = model_id or DEFAULT_MODEL_ID
        clean_text = text.strip()

        if not clean_text:
            return {"audio_base64": "", "words": [], "cached": True}

        cache_key = self._get_cache_key(clean_text, vid, mid)
        audio_file = self.cache_dir / f"{cache_key}.mp3"
        meta_file = self.cache_dir / f"{cache_key}.json"

        # 1. Check disk cache for replay (zero cost)
        if audio_file.exists() and meta_file.exists():
            try:
                audio_bytes = audio_file.read_bytes()
                meta_data = json.loads(meta_file.read_text(encoding="utf-8"))
                return {
                    "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
                    "words": meta_data.get("words", []),
                    "cached": True,
                }
            except Exception as e:
                logger.warning(f"Failed to read from ElevenLabs cache: {e}")

        # 2. Call ElevenLabs API
        api_key = setting.elevenlabs_api_key
        if not api_key:
            logger.warning("No ElevenLabs API key found in configuration.")
            return {"audio_base64": "", "words": [], "cached": False, "error": "Missing API key"}

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/with-timestamps"
        payload = {
            "text": clean_text,
            "model_id": mid,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
            },
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                headers={
                    "xi-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            if resp.status_code == 402 and vid != DEFAULT_VOICE_ID:
                logger.warning(
                    f"ElevenLabs voice '{vid}' requires a paid subscription (402). "
                    f"Falling back to premade default voice '{DEFAULT_VOICE_ID}'."
                )
                return await self.synthesize(text=clean_text, voice_id=DEFAULT_VOICE_ID, model_id=mid)

            if resp.status_code != 200:
                logger.error(f"ElevenLabs TTS error {resp.status_code}: {resp.text}")
                error_msg = f"ElevenLabs error {resp.status_code}"
                try:
                    err_json = resp.json()
                    detail = err_json.get("detail", {})
                    if isinstance(detail, dict):
                        if detail.get("code") == "quota_exceeded":
                            error_msg = "ElevenLabs quota exceeded: credits exhausted"
                        elif detail.get("message"):
                            error_msg = detail["message"]
                except Exception:
                    pass
                return {
                    "audio_base64": "",
                    "words": [],
                    "cached": False,
                    "error": error_msg,
                }

            result = resp.json()
            audio_base64 = result.get("audio_base64", "")
            alignment = result.get("alignment", {})

            words = self._aggregate_word_timestamps(alignment)

            # 3. Persist to cache
            try:
                if audio_base64:
                    raw_audio = base64.b64decode(audio_base64)
                    audio_file.write_bytes(raw_audio)
                    meta_file.write_text(json.dumps({"words": words}), encoding="utf-8")
            except Exception as e:
                logger.warning(f"Failed to write to ElevenLabs cache: {e}")

            return {
                "audio_base64": audio_base64,
                "words": words,
                "cached": False,
            }


elevenlabs_provider = ElevenLabsProvider()
