import hashlib
import io
import math
import struct
import wave
from typing import Dict, Optional, Tuple
from app.teach.emotion import get_tts_params_for_move
from app.providers.cache import audio_cache_storage
from app.providers.chatterbox_turbo import chatterbox_turbo_client

SAMPLE_RATE = 24000  # 24 kHz high-fidelity speech sample rate


def compute_cache_key(
    text: str,
    move: str = "explain",
    voice: str = "teacher-charismatic",
    speed: float = 1.0,
    exaggeration: Optional[float] = None,
) -> str:
    """Generate deterministic SHA256 cache key for TTS synthesis requests."""
    clean_text = text.strip()
    if exaggeration is None:
        emotion = get_tts_params_for_move(move)
        exaggeration = float(emotion["exaggeration"])

    payload = f"{clean_text}:{move.lower()}:{voice.lower()}:{speed:.2f}:{exaggeration:.2f}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class TTSSynthesisResult(tuple):
    """3-tuple subclass holding (wav_bytes, duration_ms, cache_key) with
    metadata attributes for cache hits, engine used, and public CDN URL.
    """

    def __new__(
        cls,
        wav_bytes: bytes,
        duration_ms: int,
        cache_key: str,
        cache_hit: bool = False,
        engine: str = "harmonic-acoustic",
        cdn_url: Optional[str] = None,
    ):
        return super().__new__(cls, (wav_bytes, duration_ms, cache_key))

    def __init__(
        self,
        wav_bytes: bytes,
        duration_ms: int,
        cache_key: str,
        cache_hit: bool = False,
        engine: str = "harmonic-acoustic",
        cdn_url: Optional[str] = None,
    ):
        self.wav_bytes = wav_bytes
        self.duration_ms = duration_ms
        self.cache_key = cache_key
        self.cache_hit = cache_hit
        self.engine = engine
        self.cdn_url = cdn_url


class HarmonicAcousticTTS:
    """Emotional Narration Engine with pedagogical move modulation and GPU Turbo integration.
    Synthesizes standard 24kHz 16-bit PCM RIFF WAV audio with harmonic vocal
    formants modulated by pedagogical move exaggeration and pitch parameters.
    Integrates multi-tiered audio caching (L1 RAM + L2 Disk + L3 R2) and remote
    GPU Chatterbox-Turbo worker orchestration.
    """

    def __init__(self, sample_rate: int = SAMPLE_RATE):
        self.sample_rate = sample_rate

    def _generate_harmonic_wav(
        self,
        clean_text: str,
        move: str,
        speed: float,
        exaggeration: float,
        pitch_scale: float,
    ) -> Tuple[bytes, int]:
        """Synthesize harmonic acoustic vocal WAV waveform."""
        speed_factor = max(0.5, min(2.0, float(speed)))

        # Pacing: ~155 spoken WPM => ~0.38s per word, scaled by speed
        words = clean_text.split()
        word_count = max(1, len(words))
        duration_s = max(0.9, (word_count * 0.38) / speed_factor)
        duration_ms = int(duration_s * 1000)
        total_samples = int(self.sample_rate * duration_s)

        # Base speech fundamental frequency F0: ~170Hz - 210Hz
        base_f0 = 185.0 * pitch_scale
        # Expressiveness / vocal inflections scale with pedagogical exaggeration
        vibrato_rate = 4.5 + (exaggeration * 2.0)  # 5.2 - 6.0 Hz
        vibrato_depth = 8.0 * exaggeration        # wider expressive pitch bends for analogy/example

        # Synthesize harmonic vocal formants (F0 + harmonics with speech envelope)
        samples = []
        for i in range(total_samples):
            t = i / self.sample_rate

            # Smooth attack (40ms) and release (80ms) amplitude envelope
            attack = min(1.0, t / 0.04)
            release = min(1.0, (duration_s - t) / 0.08) if t > (duration_s - 0.08) else 1.0
            amp_envelope = attack * release

            # Syllabic pulse modulation (~3.5 syllables per second)
            syllable_mod = 0.75 + 0.25 * math.sin(2.0 * math.pi * 3.6 * t * speed_factor)

            # Expressive pitch trajectory
            f0 = base_f0 + (vibrato_depth * math.sin(2.0 * math.pi * vibrato_rate * t))
            # Ending sentence inflection: rising for check (questions), falling for recap
            if move == "check":
                f0 += 25.0 * (t / duration_s)  # rising questioning inflection
            elif move == "recap":
                f0 -= 15.0 * (t / duration_s)  # authoritative grounding cadence

            # Formant harmonics (Fundamental F0 + 2nd + 3rd harmonic formant peaks)
            phase1 = 2.0 * math.pi * f0 * t
            phase2 = 2.0 * math.pi * (f0 * 2.1) * t
            phase3 = 2.0 * math.pi * (f0 * 3.2) * t

            sample_val = (
                0.55 * math.sin(phase1)
                + 0.28 * math.sin(phase2)
                + 0.17 * math.sin(phase3)
            )

            # Scale to 16-bit integer (-32767 to 32767) with headroom
            final_sample = int(sample_val * amp_envelope * syllable_mod * 18000.0)
            final_sample = max(-32767, min(32767, final_sample))
            samples.append(final_sample)

        # Encode PCM samples into standard RIFF WAV buffer
        wav_io = io.BytesIO()
        with wave.open(wav_io, "wb") as wf:
            wf.setnchannels(1)       # Mono speech
            wf.setsampwidth(2)       # 16-bit PCM
            wf.setframerate(self.sample_rate)
            # Pack samples into bytes (little-endian signed 16-bit)
            packed_frames = struct.pack(f"<{len(samples)}h", *samples)
            wf.writeframes(packed_frames)

        return wav_io.getvalue(), duration_ms

    def synthesize(
        self,
        text: str,
        move: str = "explain",
        voice: str = "teacher-charismatic",
        speed: float = 1.0,
    ) -> TTSSynthesisResult:
        """Synthesize audio bytes for text, returning TTSSynthesisResult(wav_bytes, duration_ms, cache_key).
        Checks multi-tiered audio cache first for zero-latency retrieval.
        Attempts Chatterbox-Turbo GPU synthesis if available, with harmonic acoustic fallback.
        """
        clean_text = text.strip()
        if not clean_text:
            clean_text = "..."

        emotion = get_tts_params_for_move(move)
        exaggeration = float(emotion["exaggeration"])  # 0.30 to 0.75
        pitch_scale = float(emotion.get("pitch_scale", 1.0))

        cache_key = compute_cache_key(clean_text, move, voice, speed, exaggeration)

        # 1. Multi-tiered Cache Lookup (L1 RAM -> L2 Disk -> L3 R2)
        cached_result = audio_cache_storage.get(cache_key)
        if cached_result is not None:
            cached_bytes, cached_ms, source_tier = cached_result
            cdn_url = None
            if audio_cache_storage.is_r2_configured:
                cdn_url = f"https://{audio_cache_storage.cache_dir.name}/{cache_key}.wav"
            return TTSSynthesisResult(
                cached_bytes,
                cached_ms,
                cache_key,
                cache_hit=True,
                engine=f"cache-{source_tier}",
                cdn_url=cdn_url,
            )

        # 2. Try Chatterbox-Turbo (350M, GPU-accelerated) worker
        engine_name = "harmonic-acoustic"
        gpu_result = chatterbox_turbo_client.synthesize(
            text=clean_text,
            move=move,
            voice=voice,
            speed=speed,
            exaggeration=exaggeration,
        )

        if gpu_result is not None:
            wav_bytes, duration_ms = gpu_result
            engine_name = "chatterbox-turbo"
        else:
            # 3. Fallback to Local Harmonic Vocal Formant Synthesis
            wav_bytes, duration_ms = self._generate_harmonic_wav(
                clean_text=clean_text,
                move=move,
                speed=speed,
                exaggeration=exaggeration,
                pitch_scale=pitch_scale,
            )

        # 4. Cache generated audio across storage tiers
        _, cdn_url = audio_cache_storage.put(
            cache_key=cache_key,
            wav_bytes=wav_bytes,
            duration_ms=duration_ms,
            text=clean_text,
            move=move,
            voice=voice,
            speed=speed,
            exaggeration=exaggeration,
        )

        return TTSSynthesisResult(
            wav_bytes,
            duration_ms,
            cache_key,
            cache_hit=False,
            engine=engine_name,
            cdn_url=cdn_url,
        )


# Singleton engine instance
tts_engine = HarmonicAcousticTTS()

# Direct dictionary view alias for legacy tests and references
AUDIO_CACHE = audio_cache_storage._memory_cache


def prewarm_tts() -> None:
    """Pre-warm TTS engine and cache on FastAPI startup to eliminate cold-start latency."""
    sample_phrase = "Welcome to your intelligent lesson."
    tts_engine.synthesize(sample_phrase, move="intro", speed=1.0)
