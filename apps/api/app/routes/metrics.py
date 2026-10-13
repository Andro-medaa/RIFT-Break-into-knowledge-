from typing import List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.schemas.response import ApiResponse
from app.telemetry.tracer import latency_tracer, LatencySummary, RequestTrace, SLO_TARGET_MS

router = APIRouter(prefix="/metrics", tags=["metrics"])


class ClientBargeInMetric(BaseModel):
    session_id: str
    speech_start_ms: float
    audio_play_ms: float
    latency_ms: float = Field(..., description="Duration from speech start to audio playback in ms")
    slo_met: Optional[bool] = None


@router.get("/summary", response_model=ApiResponse[LatencySummary])
def get_metrics_summary(
    route: Optional[str] = Query(None, description="Optional route filter (e.g., 'ask', 'tts')"),
) -> ApiResponse[LatencySummary]:
    """Retrieve live latency SLO compliance metrics, percentiles (p50, p95, p99),
    and token cost summary.
    """
    summary = latency_tracer.compute_summary(route_filter=route)
    return ApiResponse(
        success=True,
        data=summary,
        message=f"Live SLO compliance: {summary.slo_compliance_rate * 100:.1f}% under {SLO_TARGET_MS:.0f}ms target (p95: {summary.p95_ms}ms).",
    )


@router.get("/traces", response_model=ApiResponse[List[RequestTrace]])
def get_recent_traces(
    limit: int = Query(50, ge=1, le=200, description="Number of recent traces to return"),
) -> ApiResponse[List[RequestTrace]]:
    """Retrieve recent executed request traces with detailed breakdowns."""
    traces = latency_tracer.get_recent_traces(limit=limit)
    return ApiResponse(
        success=True,
        data=traces,
        message=f"Retrieved {len(traces)} recent request traces.",
    )


@router.post("/client-barge-in", response_model=ApiResponse[ClientBargeInMetric])
def record_client_barge_in_metric(payload: ClientBargeInMetric) -> ApiResponse[ClientBargeInMetric]:
    """Record client-side end-to-end latency metric from speech detection to first audio frame."""
    payload.slo_met = payload.latency_ms <= SLO_TARGET_MS

    latency_tracer.record_trace(
        trace_id=f"client_{payload.session_id[:8]}",
        route=f"/client/barge-in/{payload.session_id}",
        method="POST",
        status_code=200,
        duration_ms=payload.latency_ms,
    )

    return ApiResponse(
        success=True,
        data=payload,
        message=f"Client barge-in latency {payload.latency_ms:.1f}ms recorded (SLO {'MET' if payload.slo_met else 'BREACHED'}).",
    )
