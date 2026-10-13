from collections import deque
from datetime import datetime, timezone
import math
import time
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field

# Target SLO: Barge-in to first audio token < 1.8s (1800ms)
SLO_TARGET_MS = 1800.0


class TraceSpan(BaseModel):
    name: str
    start_ms: float
    end_ms: float
    duration_ms: float


class RequestTrace(BaseModel):
    trace_id: str
    route: str
    method: str
    status_code: int
    total_duration_ms: float
    slo_met: bool
    spans: List[TraceSpan] = Field(default_factory=list)
    tokens_prompt: int = 0
    tokens_completion: int = 0
    estimated_cost_usd: float = 0.0
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class LatencySummary(BaseModel):
    total_requests: int
    slo_target_ms: float
    slo_compliance_rate: float  # e.g., 0.985 (98.5%)
    p50_ms: float
    p90_ms: float
    p95_ms: float
    p99_ms: float
    avg_ms: float
    min_ms: float
    max_ms: float
    total_prompt_tokens: int
    total_completion_tokens: int
    total_estimated_cost_usd: float


class LatencyTracer:
    """Production Observability & SLO Latency Monitor.
    Tracks sub-1800ms barge-in and audio generation SLOs, percentiles,
    and token consumption traces.
    """

    def __init__(self, max_history: int = 1000):
        self.max_history = max_history
        self.traces: deque[RequestTrace] = deque(maxlen=max_history)
        self.total_prompt_tokens: int = 0
        self.total_completion_tokens: int = 0

    def record_trace(
        self,
        trace_id: str,
        route: str,
        method: str,
        status_code: int,
        duration_ms: float,
        spans: Optional[List[TraceSpan]] = None,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
    ) -> RequestTrace:
        """Record an executed request trace and evaluate SLO compliance."""
        slo_met = duration_ms <= SLO_TARGET_MS

        # Gemini Flash pricing reference: $0.075 / 1M prompt, $0.30 / 1M completion
        cost = (prompt_tokens * 0.000000075) + (completion_tokens * 0.00000030)

        trace = RequestTrace(
            trace_id=trace_id,
            route=route,
            method=method,
            status_code=status_code,
            total_duration_ms=round(duration_ms, 2),
            slo_met=slo_met,
            spans=spans or [],
            tokens_prompt=prompt_tokens,
            tokens_completion=completion_tokens,
            estimated_cost_usd=round(cost, 6),
        )

        self.traces.append(trace)
        self.total_prompt_tokens += prompt_tokens
        self.total_completion_tokens += completion_tokens
        return trace

    def compute_summary(self, route_filter: Optional[str] = None) -> LatencySummary:
        """Compute percentile statistics and SLO compliance."""
        filtered = list(self.traces)
        if route_filter:
            filtered = [t for t in filtered if route_filter in t.route]

        total = len(filtered)
        if total == 0:
            return LatencySummary(
                total_requests=0,
                slo_target_ms=SLO_TARGET_MS,
                slo_compliance_rate=1.0,
                p50_ms=0.0,
                p90_ms=0.0,
                p95_ms=0.0,
                p99_ms=0.0,
                avg_ms=0.0,
                min_ms=0.0,
                max_ms=0.0,
                total_prompt_tokens=self.total_prompt_tokens,
                total_completion_tokens=self.total_completion_tokens,
                total_estimated_cost_usd=round(
                    (self.total_prompt_tokens * 0.000000075) + (self.total_completion_tokens * 0.00000030), 6
                ),
            )

        durations = sorted(t.total_duration_ms for t in filtered)
        slo_compliant_count = sum(1 for t in filtered if t.slo_met)
        compliance_rate = round(slo_compliant_count / total, 4)

        def percentile(p: float) -> float:
            idx = int(math.ceil((p / 100.0) * total)) - 1
            idx = max(0, min(total - 1, idx))
            return round(durations[idx], 2)

        avg_ms = round(sum(durations) / total, 2)
        total_cost = sum(t.estimated_cost_usd for t in filtered)

        return LatencySummary(
            total_requests=total,
            slo_target_ms=SLO_TARGET_MS,
            slo_compliance_rate=compliance_rate,
            p50_ms=percentile(50),
            p90_ms=percentile(90),
            p95_ms=percentile(95),
            p99_ms=percentile(99),
            avg_ms=avg_ms,
            min_ms=round(durations[0], 2),
            max_ms=round(durations[-1], 2),
            total_prompt_tokens=sum(t.tokens_prompt for t in filtered),
            total_completion_tokens=sum(t.tokens_completion for t in filtered),
            total_estimated_cost_usd=round(total_cost, 6),
        )

    def get_recent_traces(self, limit: int = 50) -> List[RequestTrace]:
        """Return the most recent recorded traces."""
        traces_list = list(self.traces)
        return traces_list[-limit:]

    def clear(self) -> None:
        """Clear recorded traces for test isolation."""
        self.traces.clear()
        self.total_prompt_tokens = 0
        self.total_completion_tokens = 0


# Global singleton tracer
latency_tracer = LatencyTracer()
