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

DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"  # Adam (Warm & Deep Narrator)
DEFAULT_MODEL_ID = "eleven_multilingual_v2"

PRESET_VOICES = [
    {
        "voice_id": "pNInz6obpgDQGcFmaJgB",
        "name": "Adam",
        "description": "Deep, Grounded & Clear",
        "category": "premade",
    },
    {
        "voice_id": "EXAVITQu4vr4xnSDxMaL",
        "name": "Bella",
        "description": "Soft, Expressive & Gentle",
        "category": "premade",
    },
    {
        "voice_id": "tSVwqkJGEKjLklhiN0Nx",
        "name": "Viraj",
        "description": "Rich, Engaging Narrator",
        "category": "premade",
    },
    {
        "voice_id": "m4hBEimiy2ffkQ0hHMVD",
        "name": "Katie",
        "description": "Authentic, Clear & Friendly",
        "category": "premade",
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
                    voices = [
                        {
                            "voice_id": v["voice_id"],
                            "name": v.get("name", "Unnamed"),
                            "description": v.get("description") or v.get("category", "Voice"),
                            "category": v.get("category", "general"),
                            "preview_url": v.get("preview_url"),
                        }
                        for v in data.get("voices", [])
                    ]
                    self._cached_voices = voices
                    self._voices_cached_at = now
                    return voices
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
                return {
                    "audio_base64": "",
                    "words": [],
                    "cached": False,
                    "error": f"ElevenLabs error {resp.status_code}",
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
