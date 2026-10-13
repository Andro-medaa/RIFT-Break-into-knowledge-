from typing import Dict, List, Any
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status

from app.schemas.response import ApiResponse
from app.core.auth import get_current_user, User
from app.billing.models import (
    PlanTier,
    UserUsage,
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    PortalSessionRequest,
    PortalSessionResponse,
)
from app.billing.service import billing_service

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans", response_model=ApiResponse[List[PlanTier]])
def get_plans() -> ApiResponse[List[PlanTier]]:
    """Retrieve available subscription plan tiers and metered quotas."""
    plans = billing_service.get_plans()
    return ApiResponse(
        success=True,
        data=plans,
        message="Retrieved available subscription tiers.",
    )


@router.get("/usage", response_model=ApiResponse[UserUsage])
def get_user_usage(current_user: User = Depends(get_current_user)) -> ApiResponse[UserUsage]:
    """Retrieve current authenticated user's metered usage and remaining quotas."""
    usage = billing_service.get_or_create_usage(current_user.id)
    return ApiResponse(
        success=True,
        data=usage,
        message=f"Usage for user {current_user.id} ({usage.tier} tier): {usage.pages_processed}/{usage.pages_limit} pages, {usage.voice_seconds_synthesized / 60.0:.1f}/{usage.voice_minutes_limit} voice mins.",
    )


@router.post("/checkout", response_model=ApiResponse[CheckoutSessionResponse])
def create_checkout_session(
    payload: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
) -> ApiResponse[CheckoutSessionResponse]:
    """Create Stripe Checkout Session to upgrade user subscription tier."""
    try:
        session_resp = billing_service.create_checkout_session(
            user_id=current_user.id,
            tier=payload.tier,
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return ApiResponse(
        success=True,
        data=session_resp,
        message=f"Checkout session created for {payload.tier} tier.",
    )


@router.post("/portal", response_model=ApiResponse[PortalSessionResponse])
def create_customer_portal_session(
    payload: PortalSessionRequest,
    current_user: User = Depends(get_current_user),
) -> ApiResponse[PortalSessionResponse]:
    """Create Stripe Customer Portal session for managing payment methods and subscriptions."""
    portal_resp = billing_service.create_portal_session(
        user_id=current_user.id,
        return_url=payload.return_url,
    )
    return ApiResponse(
        success=True,
        data=portal_resp,
        message="Customer portal session created.",
    )


@router.post("/webhook")
async def stripe_webhook(request: Request) -> Dict[str, Any]:
    """Receive and process Stripe subscription lifecycle webhooks."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload.")

    event_type = payload.get("type", "")
    data_obj = payload.get("data", {}).get("object", {})

    result = billing_service.handle_webhook_event(event_type, data_obj)
    return {"received": True, "result": result}
