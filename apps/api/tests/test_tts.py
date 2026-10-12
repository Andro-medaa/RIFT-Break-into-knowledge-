import pytest
from app.teach.emotion import get_tts_params_for_move
from app.providers.tts import tts_engine, compute_cache_key, AUDIO_CACHE
from app.providers.cache import audio_cache_storage
from app.providers.chatterbox_turbo import ChatterboxTurboClient


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


def test_cache_key_computation_includes_exaggeration():
    # Cache key computation with explicit and derived exaggeration
    key1 = compute_cache_key("Vector embeddings", move="explain", voice="default", speed=1.0)
    key2 = compute_cache_key("Vector embeddings", move="explain", voice="default", speed=1.0, exaggeration=0.40)
    assert key1 == key2
    assert len(key1) == 64

    # Different move or exaggeration yields different cache key
    key_analogy = compute_cache_key("Vector embeddings", move="analogy", voice="default", speed=1.0)
    assert key_analogy != key1


def test_tts_engine_synthesizes_valid_wav():
    text = "Welcome to representation geometry."
    res = tts_engine.synthesize(text, move="intro", speed=1.0)

    # 3-tuple backward compatibility
    wav_bytes, duration_ms, cache_key = res
    assert len(wav_bytes) > 44  # Standard WAV header is 44 bytes
    assert wav_bytes.startswith(b"RIFF")
    assert b"WAVE" in wav_bytes[:16]
    assert duration_ms > 500
    assert len(cache_key) == 64  # SHA256 hex string

    # Attribute access on TTSSynthesisResult
    assert res.wav_bytes == wav_bytes
    assert res.duration_ms == duration_ms
    assert res.cache_key == cache_key

    # Second synthesis must be a cache hit
    res_2 = tts_engine.synthesize(text, move="intro", speed=1.0)
    assert res_2.cache_hit is True
    assert res_2.wav_bytes == wav_bytes
    assert res_2.cache_key == cache_key


def test_audio_cache_storage_disk_and_memory():
    sample_text = "Disk cache persistence verification test."
    res = tts_engine.synthesize(sample_text, move="recap", speed=1.0)
    key = res.cache_key

    # Verify present in memory
    mem_hit = audio_cache_storage.get(key)
    assert mem_hit is not None
    assert mem_hit[0] == res.wav_bytes
    assert mem_hit[2] in ("memory", "disk")

    # Clear memory cache to test disk retrieval
    audio_cache_storage._memory_cache.clear()
    disk_hit = audio_cache_storage.get(key)
    assert disk_hit is not None
    assert disk_hit[0] == res.wav_bytes
    assert disk_hit[2] == "disk"


def test_tts_endpoint_returns_wav_audio_and_cache_headers(client):
    test_phrase = "Normalized coordinates guarantee zoom resilience."
    # 1. First call -> Cache MISS
    res1 = client.post(
        "/tts",
        json={"text": test_phrase, "move": "explain", "speed": 1.0},
    )
    assert res1.status_code == 200
    assert res1.headers["content-type"] == "audio/wav"
    assert res1.headers["x-voice-move"] == "explain"
    assert res1.headers["x-emotion-exaggeration"] == "0.4"
    assert "x-duration-ms" in res1.headers
    assert res1.headers["x-cache"] in ("MISS", "HIT")
    assert res1.content.startswith(b"RIFF")

    cache_key = res1.headers["x-cache-key"]

    # 2. Second call -> Cache HIT
    res2 = client.post(
        "/tts",
        json={"text": test_phrase, "move": "explain", "speed": 1.0},
    )
    assert res2.status_code == 200
    assert res2.headers["x-cache"] == "HIT"
    assert res2.headers["x-cache-key"] == cache_key
    assert res2.content == res1.content


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
    assert "cache_hit" in data

    cache_key = data["cache_key"]
    # Retrieve directly via cache endpoint
    cache_res = client.get(f"/tts/cache/{cache_key}")
    assert cache_res.status_code == 200
    assert cache_res.headers["content-type"] == "audio/wav"
    assert cache_res.headers["x-cache"] == "HIT"
    assert cache_res.content.startswith(b"RIFF")


def test_tts_preload_endpoint(client):
    sentences = [
        {"text": "First concept to master.", "move": "intro", "speed": 1.0},
        {"text": "Let us break down the mathematical formulation.", "move": "explain", "speed": 1.0},
        {"text": "Can you identify the primary trade-off?", "move": "check", "speed": 1.0},
    ]

    res = client.post("/tts/preload", json={"items": sentences})
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["preloaded_count"] == 3
    assert len(data["cache_keys"]) == 3
    assert data["total_duration_ms"] > 1500

    # Ensure subsequent calls to these sentences hit cache
    for item in sentences:
        audio_res = client.post("/tts", json=item)
        assert audio_res.status_code == 200
        assert audio_res.headers["x-cache"] == "HIT"


def test_tts_stats_endpoint(client):
    res = client.get("/tts/stats")
    assert res.status_code == 200
    data = res.json()["data"]
    assert "total_cached_items" in data
    assert "cache_hits" in data
    assert "cache_misses" in data
    assert "hit_rate" in data
    assert "storage_backend" in data
    assert "gpu_worker_available" in data
    assert data["total_cached_items"] >= 0


def test_chatterbox_turbo_client_fallback_behavior():
    # Test client fallback when URL is unconfigured
    client = ChatterboxTurboClient(base_url="")
    assert client.is_available() is False
    res = client.synthesize("Testing fallback")
    assert res is None  # Triggers harmonic acoustic fallback gracefully

    # Test client with unreachable URL
    unreachable_client = ChatterboxTurboClient(base_url="http://127.0.0.1:59999")
    assert unreachable_client.is_available() is False
    res_unreachable = unreachable_client.synthesize("Testing unreachable worker")
    assert res_unreachable is None
    unreachable_client.close()


def test_health_check_reports_chatterbox_ready(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["status"] == "ok"
    assert data["chatterbox_ready"] is True
