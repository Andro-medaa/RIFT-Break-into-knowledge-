import pytest
from app.billing.service import billing_service, TIER_PLANS


def test_get_plans_endpoint(client):
    res = client.get("/billing/plans")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    plans = body["data"]
    plan_ids = [p["id"] for p in plans]
    assert "free" in plan_ids
    assert "scholar" in plan_ids
    assert "unlimited" in plan_ids


def test_user_usage_and_quota_tracking(client):
    res = client.get("/billing/usage")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["tier"] == "free"
    assert data["pages_limit"] == 25
    assert data["voice_minutes_limit"] == 15
    assert data["search_queries_limit"] == 30


def test_quota_check_and_breach_detection():
    test_uid = "user_metered_test_99"
    billing_service.get_or_create_usage(test_uid)

    # 1. Within quota
    allowed, _ = billing_service.check_quota(test_uid, action="pages", quantity=5)
    assert allowed is True

    # 2. Record 20 pages
    billing_service.record_usage(test_uid, action="pages", quantity=20)
    allowed, _ = billing_service.check_quota(test_uid, action="pages", quantity=5)
    assert allowed is True

    # 3. Breach pages limit (20 + 10 = 30 > 25)
    breached, reason = billing_service.check_quota(test_uid, action="pages", quantity=10)
    assert breached is False
    assert "page limit reached" in reason.lower()
    assert "upgrade" in reason.lower()

    # 4. Voice minutes tracking
    # 15 mins = 900 seconds
    billing_service.record_usage(test_uid, action="voice_seconds", quantity=800.0)
    # Asking for 200 more seconds (800+200 = 1000s > 900s)
    voice_breached, v_reason = billing_service.check_quota(test_uid, action="voice_seconds", quantity=200.0)
    assert voice_breached is False
    assert "voice narration limit reached" in v_reason.lower()


def test_checkout_session_creation(client):
    res = client.post(
        "/billing/checkout",
        json={
            "tier": "scholar",
            "success_url": "http://localhost:3000/billing/success",
            "cancel_url": "http://localhost:3000/billing/cancel",
        },
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["tier"] == "scholar"
    assert "session_id" in data
    assert "checkout_url" in data


def test_portal_session_creation(client):
    res = client.post(
        "/billing/portal",
        json={"return_url": "http://localhost:3000/profile"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert "portal_url" in data
    assert "portal_session=active" in data["portal_url"]


def test_stripe_webhook_upgrades_and_downgrades_user(client):
    user_id = "user_subscriber_101"

    # Initial state is free
    usage = billing_service.get_or_create_usage(user_id)
    assert usage.tier == "free"
    assert usage.pages_limit == 25

    # 1. Simulate Stripe checkout.session.completed webhook
    webhook_res = client.post(
        "/billing/webhook",
        json={
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "client_reference_id": user_id,
                    "metadata": {"tier": "scholar", "user_id": user_id},
                }
            },
        },
    )
    assert webhook_res.status_code == 200
    updated_usage = billing_service.get_or_create_usage(user_id)
    assert updated_usage.tier == "scholar"
    assert updated_usage.pages_limit == 250
    assert updated_usage.voice_minutes_limit == 180

    # 2. Simulate Stripe customer.subscription.deleted webhook
    cancel_res = client.post(
        "/billing/webhook",
        json={
            "type": "customer.subscription.deleted",
            "data": {
                "object": {
                    "metadata": {"user_id": user_id},
                }
            },
        },
    )
    assert cancel_res.status_code == 200
    downgraded_usage = billing_service.get_or_create_usage(user_id)
    assert downgraded_usage.tier == "free"
    assert downgraded_usage.pages_limit == 25
    assert downgraded_usage.subscription_status == "canceled"
