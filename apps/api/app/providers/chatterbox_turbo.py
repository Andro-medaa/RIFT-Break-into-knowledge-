import logging
from typing import Optional, Tuple
import httpx
from app.core.config import settings

logger = logging.getLogger("rift.chatterbox_turbo")


class ChatterboxTurboClient:
    """Client for remote Chatterbox-Turbo (350M) GPU worker.
    Provides sub-150ms GPU neural text-to-speech synthesis with full
    pedagogical emotion modulation (exaggeration dial, laughter/sigh tags).
    """

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.CHATTERBOX_TURBO_URL).rstrip("/")
        self._client: Optional[httpx.Client] = None

    def _get_client(self) -> httpx.Client:
        if self._client is None or self._client.is_closed:
            self._client = httpx.Client(timeout=4.0)
        return self._client

    def is_available(self) -> bool:
        """Check if remote GPU Chatterbox-Turbo worker is configured and responding."""
        if not self.base_url:
            return False
        try:
            client = self._get_client()
            resp = client.get(f"{self.base_url}/health", timeout=1.5)
            return resp.status_code == 200
        except Exception:
            return False

    def synthesize(
        self,
        text: str,
        move: str = "explain",
        voice: str = "teacher-charismatic",
        speed: float = 1.0,
        exaggeration: float = 0.5,
    ) -> Optional[Tuple[bytes, int]]:
        """Synthesize high-fidelity speech via remote GPU worker.
        Returns (wav_bytes, duration_ms) if successful, or None on failure/unconfigured.
        """
        if not self.base_url:
            return None

        clean_text = text.strip()
        if not clean_text:
            return None

        payload = {
            "text": clean_text,
            "move": move,
            "voice": voice,
            "speed": speed,
            "exaggeration": exaggeration,
        }

        try:
            client = self._get_client()
            resp = client.post(
                f"{self.base_url}/synthesize",
                json=payload,
                headers={"Accept": "audio/wav"},
                timeout=5.0,
            )

            if resp.status_code == 200:
                wav_bytes = resp.content
                # Read duration from worker response header or estimate from payload length
                duration_header = resp.headers.get("X-Duration-Ms")
                if duration_header and duration_header.isdigit():
                    duration_ms = int(duration_header)
                else:
                    duration_ms = int(len(clean_text.split()) * 380 / max(0.5, speed))

                return wav_bytes, duration_ms
            else:
                logger.warning(
                    f"Chatterbox-Turbo GPU worker returned status {resp.status_code}: {resp.text[:200]}"
                )
                return None
        except Exception as e:
            logger.info(f"Chatterbox-Turbo GPU worker offline or unreachable ({e}). Falling back to local engine.")
            return None

    def close(self) -> None:
        if self._client and not self._client.is_closed:
            self._client.close()


# Global client instance
chatterbox_turbo_client = ChatterboxTurboClient()
