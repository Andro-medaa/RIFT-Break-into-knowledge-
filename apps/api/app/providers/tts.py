import hashlib
import io
import math
import struct
import wave
from typing import Dict, Tuple
from app.teach.emotion import get_tts_params_for_move

# In-memory audio cache: cache_key -> (audio_bytes, duration_ms)
AUDIO_CACHE: Dict[str, Tuple[bytes, int]] = {}

SAMPLE_RATE = 24000  # 24 kHz high-fidelity speech sample rate


def compute_cache_key(text: str, move: str, voice: str, speed: float) -> str:
    """Generate deterministic SHA256 cache key for TTS synthesis requests."""
    payload = f"{text.strip()}:{move.lower()}:{voice.lower()}:{speed:.2f}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class HarmonicAcousticTTS:
    """Emotional Narration Engine with pedagogical move modulation.
    Synthesizes standard 24kHz 16-bit PCM RIFF WAV audio with harmonic vocal
    formants modulated by pedagogical move exaggeration and pitch parameters.
    """

    def __init__(self, sample_rate: int = SAMPLE_RATE):
        self.sample_rate = sample_rate

    def synthesize(
        self,
        text: str,
        move: str = "explain",
        voice: str = "teacher-charismatic",
        speed: float = 1.0,
    ) -> Tuple[bytes, int, str]:
        """Synthesize audio bytes for text, returning (wav_bytes, duration_ms, cache_key).
        Checks memory cache first for zero-latency retrieval.
        """
        clean_text = text.strip()
        if not clean_text:
            clean_text = "..."

        cache_key = compute_cache_key(clean_text, move, voice, speed)
        if cache_key in AUDIO_CACHE:
            cached_bytes, cached_ms = AUDIO_CACHE[cache_key]
            return cached_bytes, cached_ms, cache_key

        emotion = get_tts_params_for_move(move)
        exaggeration = float(emotion["exaggeration"])  # 0.30 to 0.75
        pitch_scale = float(emotion.get("pitch_scale", 1.0))
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

        wav_bytes = wav_io.getvalue()
        AUDIO_CACHE[cache_key] = (wav_bytes, duration_ms)
        return wav_bytes, duration_ms, cache_key


# Singleton instance
tts_engine = HarmonicAcousticTTS()


def prewarm_tts() -> None:
    """Pre-warm TTS engine on FastAPI startup to eliminate cold-start latency."""
    sample_phrase = "Welcome to your intelligent lesson."
    tts_engine.synthesize(sample_phrase, move="intro", speed=1.0)
