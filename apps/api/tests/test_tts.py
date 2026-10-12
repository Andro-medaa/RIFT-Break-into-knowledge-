import pytest
from app.teach.emotion import get_tts_params_for_move, MOVE_EMOTION_CONFIG
from app.providers.tts import tts_engine, compute_cache_key, AUDIO_CACHE


def test_emotion_mapping_all_moves():
    expected_moves = ["intro", "explain", "example", "analogy", "recap", "check"]
    for move in expected_moves:
        params = get_tts_params_for_move(move)
        assert "exaggeration" in params
        assert "speed" in params
        assert "tone_descriptor" in params
        assert 0.0 <= params["exaggeration"] <= 1.0

    # Specific locked values from specification:
    assert get_tts_params_for_move("intro")["exaggeration"] == 0.35
    assert get_tts_params_for_move("explain")["exaggeration"] == 0.40
    assert get_tts_params_for_move("example")["exaggeration"] == 0.65
    assert get_tts_params_for_move("analogy")["exaggeration"] == 0.75
    assert get_tts_params_for_move("recap")["exaggeration"] == 0.30
    assert get_tts_params_for_move("check")["exaggeration"] == 0.55


def test_tts_engine_synthesizes_valid_wav():
    text = "Welcome to representation geometry."
    wav_bytes, duration_ms, cache_key = tts_engine.synthesize(text, move="intro", speed=1.0)

    assert len(wav_bytes) > 44  # Standard WAV header is 44 bytes
    assert wav_bytes.startswith(b"RIFF")
    assert b"WAVE" in wav_bytes[:16]
    assert duration_ms > 500
    assert len(cache_key) == 64  # SHA256 hex string

    # Second synthesis should hit the memory cache
    wav_bytes_2, duration_ms_2, cache_key_2 = tts_engine.synthesize(text, move="intro", speed=1.0)
    assert wav_bytes == wav_bytes_2
    assert cache_key == cache_key_2


def test_tts_endpoint_returns_wav_audio(client):
    res = client.post(
        "/tts",
        json={"text": "Consider a normalized bounding box.", "move": "explain", "speed": 1.0},
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    assert res.headers["x-voice-move"] == "explain"
    assert "x-emotion-exaggeration" in res.headers
    assert res.headers["x-emotion-exaggeration"] == "0.4"
    assert "x-duration-ms" in res.headers
    assert res.content.startswith(b"RIFF")


def test_tts_meta_endpoint_and_cache_lookup(client):
    res = client.post(
        "/tts/meta",
        json={"text": "Think of this like an interconnected puzzle.", "move": "analogy", "speed": 1.0},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    data = body["data"]
    assert data["move"] == "analogy"
    assert data["exaggeration"] == 0.75
    assert data["format"] == "audio/wav"
    assert len(data["audio_base64"]) > 100

    cache_key = data["cache_key"]
    # Retrieve directly via cache endpoint
    cache_res = client.get(f"/tts/cache/{cache_key}")
    assert cache_res.status_code == 200
    assert cache_res.headers["content-type"] == "audio/wav"
    assert cache_res.content.startswith(b"RIFF")


def test_health_check_reports_chatterbox_ready(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["status"] == "ok"
    assert data["chatterbox_ready"] is True
