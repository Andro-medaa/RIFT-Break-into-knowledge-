from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class PlanTier(BaseModel):
    id: str  # "free" | "scholar" | "unlimited"
    name: str
    price_usd_monthly: float
    pages_per_month: int
    voice_minutes_per_month: int
    search_queries_per_month: int
    features: List[str]


class UserUsage(BaseModel):
    user_id: str
    tier: str = "free"
    pages_processed: int = 0
    voice_seconds_synthesized: float = 0.0
    search_queries: int = 0
    pages_limit: int = 25
    voice_minutes_limit: int = 15
    search_queries_limit: int = 30
    stripe_customer_id: Optional[str] = None
    subscription_status: str = "active"  # "active" | "past_due" | "canceled"


class CheckoutSessionRequest(BaseModel):
    tier: str = Field(..., description="Target tier: scholar or unlimited")
    success_url: str = Field(..., description="Redirect URL upon successful Stripe checkout")
    cancel_url: str = Field(..., description="Redirect URL upon cancelled Stripe checkout")


class CheckoutSessionResponse(BaseModel):
    session_id: str
    checkout_url: str
    tier: str


class PortalSessionRequest(BaseModel):
    return_url: str = Field(..., description="Redirect URL when user finishes in Stripe Customer Portal")


class PortalSessionResponse(BaseModel):
    portal_url: str
