from typing import Dict, Any

MOVE_EMOTION_CONFIG: Dict[str, Dict[str, Any]] = {
    "intro": {
        "exaggeration": 0.35,
        "speed": 1.00,
        "pitch_scale": 1.00,
        "tone_descriptor": "Warm, welcoming, inviting with measured cadence",
    },
    "explain": {
        "exaggeration": 0.40,
        "speed": 1.00,
        "pitch_scale": 1.02,
        "tone_descriptor": "Clear, focused, instructive with steady pitch",
    },
    "example": {
        "exaggeration": 0.65,
        "speed": 1.05,
        "pitch_scale": 1.08,
        "tone_descriptor": "Enthusiastic, vivid, engaging with upbeat dynamics",
    },
    "analogy": {
        "exaggeration": 0.75,
        "speed": 1.02,
        "pitch_scale": 1.12,
        "tone_descriptor": "Playful, relatable, imaginative with expressive pauses",
    },
    "recap": {
        "exaggeration": 0.30,
        "speed": 0.95,
        "pitch_scale": 0.96,
        "tone_descriptor": "Grounded, authoritative, slower tempo with final cadence",
    },
    "check": {
        "exaggeration": 0.55,
        "speed": 1.00,
        "pitch_scale": 1.06,
        "tone_descriptor": "Encouraging, inquisitive with rising question inflection",
    },
}

DEFAULT_EMOTION: Dict[str, Any] = {
    "exaggeration": 0.45,
    "speed": 1.00,
    "pitch_scale": 1.00,
    "tone_descriptor": "Balanced pedagogical delivery",
}


def get_tts_params_for_move(move: str) -> Dict[str, Any]:
    """Retrieve voice parameters (exaggeration, speed, pitch, descriptor)
    tailored to the pedagogical move.
    """
    clean_move = move.lower().strip()
    return MOVE_EMOTION_CONFIG.get(clean_move, DEFAULT_EMOTION)
