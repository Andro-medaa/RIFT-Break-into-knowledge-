def test_health_check(client):
    """Test /health endpoint conforms to ApiResponse[dict] envelope."""
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["status"] == "ok"
    assert payload["data"]["service"] == "RIFT API"
    assert payload["error"] is None

def test_ping(client):
    """Test /api/ping endpoint conforms to ApiResponse[dict] and provides timestamp."""
    response = client.get("/api/ping")
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["status"] == "pong"
    assert "timestamp" in payload["data"]
    assert payload["error"] is None
