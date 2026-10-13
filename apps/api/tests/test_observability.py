import pytest
from app.telemetry.tracer import latency_tracer, SLO_TARGET_MS


def test_timing_middleware_injects_headers_and_records_trace(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert "x-response-time-ms" in res.headers
    assert float(res.headers["x-response-time-ms"]) >= 0.0
    assert "x-trace-id" in res.headers


def test_latency_tracer_percentiles_and_slo_compliance():
    tracer = latency_tracer
    tracer.clear()

    # Record 10 mock latencies: 9 under 1800ms SLO target, 1 breach
    latencies = [150.0, 200.0, 320.0, 450.0, 500.0, 650.0, 800.0, 1100.0, 1400.0, 2100.0]
    for idx, lat in enumerate(latencies):
        tracer.record_trace(
            trace_id=f"test_{idx}",
            route="/sessions/test/ask",
            method="POST",
            status_code=200,
            duration_ms=lat,
            prompt_tokens=100,
            completion_tokens=50,
        )

    summary = tracer.compute_summary()
    assert summary.total_requests == 10
    assert summary.slo_target_ms == SLO_TARGET_MS
    # 9 out of 10 met SLO => 90% compliance
    assert summary.slo_compliance_rate == 0.90
    assert summary.min_ms == 150.0
    assert summary.max_ms == 2100.0
    assert summary.p50_ms == 500.0
    assert summary.total_prompt_tokens == 1000
    assert summary.total_completion_tokens == 500
    assert summary.total_estimated_cost_usd > 0.0


def test_metrics_summary_endpoint(client):
    res = client.get("/metrics/summary")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    data = body["data"]
    assert "slo_target_ms" in data
    assert "slo_compliance_rate" in data
    assert "p50_ms" in data
    assert "p95_ms" in data
    assert "total_estimated_cost_usd" in data


def test_metrics_traces_endpoint(client):
    res = client.get("/metrics/traces?limit=10")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert isinstance(body["data"], list)


def test_client_barge_in_telemetry_reporting(client):
    # Compliant barge-in (< 1800ms)
    res_good = client.post(
        "/metrics/client-barge-in",
        json={
            "session_id": "sess_123456",
            "speech_start_ms": 1000.0,
            "audio_play_ms": 2420.0,
            "latency_ms": 1420.0,
        },
    )
    assert res_good.status_code == 200
    data_good = res_good.json()["data"]
    assert data_good["slo_met"] is True
    assert "MET" in res_good.json()["message"]

    # Breached barge-in (> 1800ms)
    res_slow = client.post(
        "/metrics/client-barge-in",
        json={
            "session_id": "sess_123456",
            "speech_start_ms": 1000.0,
            "audio_play_ms": 3200.0,
            "latency_ms": 2200.0,
        },
    )
    assert res_slow.status_code == 200
    data_slow = res_slow.json()["data"]
    assert data_slow["slo_met"] is False
    assert "BREACHED" in res_slow.json()["message"]
