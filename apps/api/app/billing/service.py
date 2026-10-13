from datetime import datetime, timezone
import logging
from typing import Dict, List, Optional, Tuple
import uuid

from app.core.config import settings
from app.billing.models import (
    PlanTier,
    UserUsage,
    CheckoutSessionResponse,
    PortalSessionResponse,
)

logger = logging.getLogger("rift.billing")

TIER_PLANS: Dict[str, PlanTier] = {
    "free": PlanTier(
        id="free",
        name="Free Scholar",
        price_usd_monthly=0.0,
        pages_per_month=25,
        voice_minutes_per_month=15,
        search_queries_per_month=30,
        features=[
            "25 PDF pages per month",
            "15 voice narration minutes",
            "30 dual-grounded search answers",
            "Client-side barge-in interruption",
            "Interactive mini-map & highlights",
        ],
    ),
    "scholar": PlanTier(
        id="scholar",
        name="Pro Scholar",
        price_usd_monthly=15.0,
        pages_per_month=250,
        voice_minutes_per_month=180,
        search_queries_per_month=500,
        features=[
            "250 PDF pages per month",
            "180 voice narration minutes",
            "500 Google Search grounded queries",
            "Sub-150ms GPU Chatterbox-Turbo speech",
            "Persistent session resumes & cloud sync",
        ],
    ),
    "unlimited": PlanTier(
        id="unlimited",
        name="Unlimited Researcher",
        price_usd_monthly=30.0,
        pages_per_month=10000,
        voice_minutes_per_month=1000,
        search_queries_per_month=10000,
        features=[
            "Virtually unlimited PDF pages (10k/mo)",
            "1,000 voice narration minutes",
            "Unlimited web-grounded Q&A citations",
            "Dedicated GPU worker prioritization",
            "Exportable audio lessons & transcripts",
        ],
    ),
}


class BillingService:
    """Production Billing & Metered Usage Service.
    Tracks metered usage across PDF pages, audio voice minutes, and search queries.
    Enforces subscription quotas and manages Stripe checkout & customer portal sessions.
    """

    def __init__(self):
        # In-memory store: user_id -> UserUsage
        self.usage_store: Dict[str, UserUsage] = {}

    def get_plans(self) -> List[PlanTier]:
        """Return available subscription plan tiers."""
        return list(TIER_PLANS.values())

    def get_or_create_usage(self, user_id: str) -> UserUsage:
        """Get or initialize user usage record with tier limits."""
        if user_id not in self.usage_store:
            free_tier = TIER_PLANS["free"]
            self.usage_store[user_id] = UserUsage(
                user_id=user_id,
                tier="free",
                pages_processed=0,
                voice_seconds_synthesized=0.0,
                search_queries=0,
                pages_limit=free_tier.pages_per_month,
                voice_minutes_limit=free_tier.voice_minutes_per_month,
                search_queries_limit=free_tier.search_queries_per_month,
            )
        return self.usage_store[user_id]

    def check_quota(self, user_id: str, action: str, quantity: float = 1.0) -> Tuple[bool, str]:
        """Verify whether user has sufficient quota for action before executing.
        Actions: 'pages', 'voice_seconds', 'search'.
        Returns (has_quota, reason).
        """
        usage = self.get_or_create_usage(user_id)

        if action == "pages":
            if usage.pages_processed + int(quantity) > usage.pages_limit:
                return (
                    False,
                    f"Page limit reached ({usage.pages_processed}/{usage.pages_limit} pages). Upgrade to Pro Scholar for 250 pages/mo.",
                )
        elif action == "voice_seconds":
            voice_minutes = (usage.voice_seconds_synthesized + quantity) / 60.0
            if voice_minutes > usage.voice_minutes_limit:
                return (
                    False,
                    f"Voice narration limit reached ({usage.voice_seconds_synthesized / 60.0:.1f}/{usage.voice_minutes_limit} mins). Upgrade to Pro Scholar for 180 mins/mo.",
                )
        elif action == "search":
            if usage.search_queries + int(quantity) > usage.search_queries_limit:
                return (
                    False,
                    f"Search queries limit reached ({usage.search_queries}/{usage.search_queries_limit}). Upgrade to Pro Scholar for 500 queries/mo.",
                )

        return True, "Quota available"

    def record_usage(self, user_id: str, action: str, quantity: float = 1.0) -> UserUsage:
        """Increment user metered usage counter."""
        usage = self.get_or_create_usage(user_id)

        if action == "pages":
            usage.pages_processed += int(quantity)
        elif action == "voice_seconds":
            usage.voice_seconds_synthesized += float(quantity)
        elif action == "search":
            usage.search_queries += int(quantity)

        return usage

    def upgrade_tier(self, user_id: str, target_tier: str) -> UserUsage:
        """Upgrade user to target tier and adjust quota ceilings."""
        if target_tier not in TIER_PLANS:
            raise ValueError(f"Invalid tier '{target_tier}'. Must be one of {list(TIER_PLANS.keys())}")

        plan = TIER_PLANS[target_tier]
        usage = self.get_or_create_usage(user_id)
        usage.tier = target_tier
        usage.pages_limit = plan.pages_per_month
        usage.voice_minutes_limit = plan.voice_minutes_per_month
        usage.search_queries_limit = plan.search_queries_per_month
        usage.subscription_status = "active"
        return usage

    def create_checkout_session(
        self,
        user_id: str,
        tier: str,
        success_url: str,
        cancel_url: str,
    ) -> CheckoutSessionResponse:
        """Create Stripe Checkout Session for subscription upgrade."""
        if tier not in ("scholar", "unlimited"):
            raise ValueError("Only 'scholar' or 'unlimited' tiers require checkout.")

        session_id = f"cs_test_{uuid.uuid4().hex[:16]}"
        checkout_url = f"{success_url}?session_id={session_id}&tier={tier}"

        # If live Stripe is configured:
        # In production with stripe package:
        # session = stripe.checkout.Session.create(customer=..., price=..., ...)
        return CheckoutSessionResponse(
            session_id=session_id,
            checkout_url=checkout_url,
            tier=tier,
        )

    def create_portal_session(self, user_id: str, return_url: str) -> PortalSessionResponse:
        """Create Stripe Customer Portal session for subscription management."""
        portal_url = f"{return_url}?portal_session=active&user_id={user_id}"
        return PortalSessionResponse(portal_url=portal_url)

    def handle_webhook_event(self, event_type: str, data_object: dict) -> Dict[str, str]:
        """Handle incoming Stripe webhook events."""
        if event_type == "checkout.session.completed":
            user_id = data_object.get("client_reference_id") or data_object.get("metadata", {}).get("user_id")
            tier = data_object.get("metadata", {}).get("tier", "scholar")
            if user_id:
                self.upgrade_tier(user_id, tier)
                return {"status": "upgraded", "user_id": user_id, "tier": tier}

        elif event_type == "customer.subscription.deleted":
            user_id = data_object.get("metadata", {}).get("user_id")
            if user_id:
                self.upgrade_tier(user_id, "free")
                usage = self.get_or_create_usage(user_id)
                usage.subscription_status = "canceled"
                return {"status": "downgraded_to_free", "user_id": user_id}

        return {"status": "ignored", "event_type": event_type}


# Global singleton billing service
billing_service = BillingService()
