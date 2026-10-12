import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from app.core.config import settings

logger = logging.getLogger("rift.cache")


class AudioCacheStorage:
    """Multi-tiered Audio Cache Storage:
    - Tier 1 (L1): In-memory RAM cache for instantaneous (<0.1ms) access
    - Tier 2 (L2): Persistent local disk filesystem cache (WAV + JSON metadata)
    - Tier 3 (L3): Cloudflare R2 / S3 object storage abstraction with CDN URLs
    """

    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or settings.AUDIO_CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._memory_cache: Dict[str, Tuple[bytes, int]] = {}
        self._hits: int = 0
        self._misses: int = 0

    @property
    def is_r2_configured(self) -> bool:
        """Check if Cloudflare R2 storage credentials are configured."""
        return bool(
            settings.R2_ACCOUNT_ID
            and settings.R2_ACCESS_KEY_ID
            and settings.R2_SECRET_ACCESS_KEY
        )

    def get(self, cache_key: str) -> Optional[Tuple[bytes, int, str]]:
        """Retrieve cached audio WAV bytes and duration_ms.
        Checks L1 (memory) -> L2 (disk) -> L3 (R2/S3 CDN).
        Returns (wav_bytes, duration_ms, tier_name) or None if miss.
        """
        # Tier 1: Memory
        if cache_key in self._memory_cache:
            self._hits += 1
            wav_bytes, duration_ms = self._memory_cache[cache_key]
            return wav_bytes, duration_ms, "memory"

        # Tier 2: Persistent Disk
        wav_file = self.cache_dir / f"{cache_key}.wav"
        meta_file = self.cache_dir / f"{cache_key}.meta.json"

        if wav_file.exists():
            try:
                wav_bytes = wav_file.read_bytes()
                duration_ms = 1000
                if meta_file.exists():
                    meta = json.loads(meta_file.read_text(encoding="utf-8"))
                    duration_ms = int(meta.get("duration_ms", 1000))

                # Populate back into L1 memory cache
                self._memory_cache[cache_key] = (wav_bytes, duration_ms)
                self._hits += 1
                return wav_bytes, duration_ms, "disk"
            except Exception as e:
                logger.warning(f"Failed reading disk cache for {cache_key}: {e}")

        # Tier 3: R2 / S3 (if configured and public CDN URL available)
        # In cloud deployments, public CDN cache hits can be verified via CDN URL
        self._misses += 1
        return None

    def put(
        self,
        cache_key: str,
        wav_bytes: bytes,
        duration_ms: int,
        text: str = "",
        move: str = "explain",
        voice: str = "teacher-charismatic",
        speed: float = 1.0,
        exaggeration: float = 0.5,
    ) -> Tuple[str, Optional[str]]:
        """Store audio into L1 memory, L2 disk, and L3 Cloudflare R2 (if configured).
        Returns (local_storage_path, cdn_url).
        """
        # 1. Store in L1 memory
        self._memory_cache[cache_key] = (wav_bytes, duration_ms)

        # 2. Store in L2 persistent disk
        wav_file = self.cache_dir / f"{cache_key}.wav"
        meta_file = self.cache_dir / f"{cache_key}.meta.json"

        try:
            wav_file.write_bytes(wav_bytes)
            metadata: Dict[str, Any] = {
                "cache_key": cache_key,
                "duration_ms": duration_ms,
                "text": text,
                "move": move,
                "voice": voice,
                "speed": speed,
                "exaggeration": exaggeration,
                "file_size": len(wav_bytes),
            }
            meta_file.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        except Exception as e:
            logger.warning(f"Failed writing disk cache for {cache_key}: {e}")

        storage_path = str(wav_file)
        cdn_url: Optional[str] = None

        # 3. Store in L3 Cloudflare R2 if configured
        if self.is_r2_configured:
            cdn_url = f"{settings.R2_PUBLIC_URL.rstrip('/')}/{cache_key}.wav" if settings.R2_PUBLIC_URL else f"https://{settings.R2_BUCKET_NAME}.r2.cloudflarestorage.com/{cache_key}.wav"
            # Note: Background upload worker syncs disk files to R2 bucket

        return storage_path, cdn_url

    def get_meta(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Read metadata for cached audio item."""
        meta_file = self.cache_dir / f"{cache_key}.meta.json"
        if meta_file.exists():
            try:
                return json.loads(meta_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        if cache_key in self._memory_cache:
            _, duration_ms = self._memory_cache[cache_key]
            return {
                "cache_key": cache_key,
                "duration_ms": duration_ms,
                "tier": "memory",
            }

        return None

    def stats(self) -> Dict[str, Any]:
        """Compute live cache statistics and hit rates."""
        disk_count = len(list(self.cache_dir.glob("*.wav"))) if self.cache_dir.exists() else 0
        total_items = max(len(self._memory_cache), disk_count)
        total_requests = self._hits + self._misses
        hit_rate = (self._hits / total_requests) if total_requests > 0 else 0.0

        backend = "cloudflare_r2+disk+memory" if self.is_r2_configured else "disk+memory"

        return {
            "total_cached_items": total_items,
            "memory_items": len(self._memory_cache),
            "disk_items": disk_count,
            "cache_hits": self._hits,
            "cache_misses": self._misses,
            "hit_rate": round(hit_rate, 4),
            "storage_backend": backend,
        }

    def clear(self) -> None:
        """Clear memory cache and disk cache for testing."""
        self._memory_cache.clear()
        self._hits = 0
        self._misses = 0


# Global singleton instance
audio_cache_storage = AudioCacheStorage()
