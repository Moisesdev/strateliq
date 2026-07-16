"""STRATELIQ P1 features tests.

Covers:
- Password reset: /api/auth/forgot-password (200 for existing/non-existent), /api/auth/reset-password (200 valid, 400 invalid)
- Plans: /api/plans returns 3 plans with correct amounts
- Subscription: /api/subscription returns free by default
- Stripe checkout: POST /api/checkout/session returns url/session_id, persists payment_transactions
- Checkout status: GET /api/checkout/status/{id} - endpoint exists
- Admin openrouter: PUT /api/admin/config accepts provider=openrouter; non-admin 403
- OpenRouter chat streaming: real SSE with 3+ deltas (then reset config to openai/gpt-4.1-mini)
- Regression: openai default streaming still returns structured markers
"""
import os
import re
import json
import uuid
import time
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load backend .env so tests can reach Mongo directly for verification steps
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@strateliq.dev"
DEMO_PASSWORD = "Demo1234!"
ADMIN_EMAIL = "admin@strateliq.dev"
ADMIN_PASSWORD = "Admin1234!"


def _login(email, password):
    r = requests.post(f"{API}/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    return r.json()["token"]


def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def demo_token():
    return _login(DEMO_EMAIL, DEMO_PASSWORD)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


# -------- Password Reset --------
class TestPasswordReset:
    def test_forgot_password_existing_user_returns_ok(self):
        r = requests.post(f"{API}/auth/forgot-password", json={
            "email": DEMO_EMAIL,
            "frontend_origin": "https://example.com",
        }, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

    def test_forgot_password_nonexistent_returns_ok(self):
        r = requests.post(f"{API}/auth/forgot-password", json={
            "email": f"nobody_{uuid.uuid4().hex[:6]}@example.com",
            "frontend_origin": "https://example.com",
        }, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

    def test_reset_password_invalid_token_returns_400(self):
        r = requests.post(f"{API}/auth/reset-password", json={
            "token": "totally-bogus-token-xxx",
            "new_password": "NewPass1234!",
        }, timeout=15)
        assert r.status_code == 400

    def test_reset_password_short_password_returns_400(self):
        r = requests.post(f"{API}/auth/reset-password", json={
            "token": "anything",
            "new_password": "123",
        }, timeout=15)
        assert r.status_code == 400

    def test_reset_password_full_flow_and_used_token(self):
        """Create a throwaway user, request reset, pull token from Mongo via helper endpoint if any.

        Since there is no admin endpoint to fetch reset tokens, we call the DB
        indirectly by using the mongo shell via subprocess isn't allowed here.
        Instead, we validate the full flow using the DB directly through motor
        would require the same app. We use pymongo synchronously to fetch the
        token from the collection.
        """
        # Register a fresh user
        email = f"pw_{uuid.uuid4().hex[:8]}@strateliq.dev"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "TestPass123!", "name": "PW TEST_",
        }, timeout=15)
        assert r.status_code == 200

        # Trigger forgot password
        r = requests.post(f"{API}/auth/forgot-password", json={
            "email": email, "frontend_origin": "https://example.com",
        }, timeout=15)
        assert r.status_code == 200

        # Fetch token from Mongo directly
        from pymongo import MongoClient
        mc = MongoClient(os.environ["MONGO_URL"])
        db = mc[os.environ["DB_NAME"]]
        # Find latest reset for that user
        u = db.users.find_one({"email": email})
        assert u, "user should exist"
        doc = db.password_resets.find_one(
            {"user_id": u["user_id"], "used": False},
            sort=[("created_at", -1)],
        )
        assert doc and doc.get("token"), "reset token should be stored"
        token = doc["token"]

        # Reset password with valid token
        new_pw = "BrandNewPass456!"
        r = requests.post(f"{API}/auth/reset-password", json={
            "token": token, "new_password": new_pw,
        }, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"ok": True}

        # Login with new password
        r = requests.post(f"{API}/auth/login", json={
            "email": email, "password": new_pw,
        }, timeout=15)
        assert r.status_code == 200

        # Login with old password should fail
        r = requests.post(f"{API}/auth/login", json={
            "email": email, "password": "TestPass123!",
        }, timeout=15)
        assert r.status_code == 401

        # Reusing the same token must fail (marked used)
        r = requests.post(f"{API}/auth/reset-password", json={
            "token": token, "new_password": "AnotherPass789!",
        }, timeout=15)
        assert r.status_code == 400


# -------- Plans + Subscription --------
class TestPlansAndSubscription:
    def test_plans_returns_three_plans(self):
        r = requests.get(f"{API}/plans", timeout=15)
        assert r.status_code == 200
        plans = r.json()
        assert isinstance(plans, list) and len(plans) == 3
        by_id = {p["id"]: p for p in plans}
        assert set(by_id.keys()) == {"inicial", "pro", "max"}
        assert by_id["inicial"]["amount"] == 1.00
        assert by_id["pro"]["amount"] == 19.00
        assert by_id["max"]["amount"] == 49.00
        for p in plans:
            assert p["currency"] == "usd"
            assert isinstance(p["period_days"], int) and p["period_days"] > 0

    def test_subscription_default_is_free(self, demo_token):
        r = requests.get(f"{API}/subscription", headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Might be active if a previous test activated it, but by default is free
        assert data["plan_id"] in ("free", "inicial", "pro", "max")
        # If free, status must be 'free' (or 'expired')
        if data["plan_id"] == "free":
            assert data["status"] in ("free", "expired")

    def test_subscription_requires_auth(self):
        r = requests.get(f"{API}/subscription", timeout=15)
        assert r.status_code == 401


# -------- Stripe Checkout --------
class TestCheckout:
    def test_create_checkout_session(self, demo_token):
        r = requests.post(f"{API}/checkout/session", headers=H(demo_token), json={
            "plan_id": "inicial",
            "origin_url": "https://example.com",
        }, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("url", "").startswith("https://"), f"expected Stripe URL, got {data}"
        assert "stripe.com" in data["url"], f"expected stripe.com in URL: {data['url']}"
        assert data.get("session_id"), "session_id must be returned"
        TestCheckout._session_id = data["session_id"]

        # Verify persistence
        from pymongo import MongoClient
        mc = MongoClient(os.environ["MONGO_URL"])
        db = mc[os.environ["DB_NAME"]]
        tx = db.payment_transactions.find_one({"session_id": data["session_id"]})
        assert tx is not None, "payment_transaction should be persisted"
        assert tx["payment_status"] == "initiated"
        assert tx["plan_id"] == "inicial"
        assert tx["amount"] == 1.00

    def test_create_checkout_invalid_plan_returns_422(self, demo_token):
        r = requests.post(f"{API}/checkout/session", headers=H(demo_token), json={
            "plan_id": "premium",  # invalid
            "origin_url": "https://example.com",
        }, timeout=15)
        assert r.status_code == 422

    def test_checkout_status_for_own_session(self, demo_token):
        session_id = getattr(TestCheckout, "_session_id", None)
        if not session_id:
            pytest.skip("session not created")
        r = requests.get(f"{API}/checkout/status/{session_id}", headers=H(demo_token), timeout=30)
        # Endpoint exists and returns something. Payment isn't completed, so payment_status is not 'paid'.
        assert r.status_code == 200, r.text
        data = r.json()
        assert "payment_status" in data
        assert data["payment_status"] != "paid"
        assert data["plan_id"] == "inicial"

    def test_checkout_status_unknown_session_returns_404(self, demo_token):
        r = requests.get(f"{API}/checkout/status/cs_unknown_{uuid.uuid4().hex[:10]}",
                         headers=H(demo_token), timeout=15)
        assert r.status_code == 404

    def test_checkout_session_requires_auth(self):
        r = requests.post(f"{API}/checkout/session", json={
            "plan_id": "pro", "origin_url": "https://example.com",
        }, timeout=15)
        assert r.status_code == 401


# -------- Admin config (OpenRouter provider) --------
class TestAdminOpenRouter:
    def test_non_admin_put_returns_403(self, demo_token):
        r = requests.put(f"{API}/admin/config", headers=H(demo_token), json={
            "provider": "openrouter", "model": "openai/gpt-4o-mini",
        }, timeout=15)
        assert r.status_code == 403

    def test_admin_put_openrouter_ok(self, admin_token):
        r = requests.put(f"{API}/admin/config", headers=H(admin_token), json={
            "provider": "openrouter", "model": "openai/gpt-4o-mini",
        }, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"provider": "openrouter", "model": "openai/gpt-4o-mini"}

    def test_admin_put_invalid_provider_returns_422(self, admin_token):
        r = requests.put(f"{API}/admin/config", headers=H(admin_token), json={
            "provider": "foobar", "model": "x",
        }, timeout=15)
        assert r.status_code == 422


# -------- Chat streaming via OpenRouter --------
def _stream_chat_and_collect(token: str, message: str, timeout: int = 90):
    """Run POST /chat/stream, return (deltas_count, full_text, events)."""
    headers = H(token)
    headers["Accept"] = "text/event-stream"
    events = []
    full_text = ""
    with requests.post(f"{API}/chat/stream", json={"message": message},
                       headers=headers, stream=True, timeout=timeout) as r:
        assert r.status_code == 200, r.text
        buf = ""
        for chunk in r.iter_content(chunk_size=None, decode_unicode=True):
            if not chunk:
                continue
            buf += chunk
            while "\n\n" in buf:
                raw, buf = buf.split("\n\n", 1)
                lines = raw.split("\n")
                event = "message"
                data = ""
                for line in lines:
                    if line.startswith("event:"):
                        event = line[6:].strip()
                    elif line.startswith("data:"):
                        v = line[5:]
                        if v.startswith(" "):
                            v = v[1:]
                        data += v
                events.append((event, data))
                if event == "message":
                    full_text += (data.replace("\\n", "\n")
                                      .replace('\\"', '"')
                                      .replace("\\\\", "\\"))
                elif event == "error":
                    return events, full_text
                elif event == "done":
                    return events, full_text
            if events and events[-1][0] in ("done", "error"):
                break
    return events, full_text


class TestChatOpenRouterAndRegression:
    """Runs LAST to configure admin back to openai after openrouter test."""

    def test_openrouter_stream_real_deltas(self, admin_token, demo_token):
        # Set config to openrouter
        r = requests.put(f"{API}/admin/config", headers=H(admin_token), json={
            "provider": "openrouter", "model": "openai/gpt-4o-mini",
        }, timeout=15)
        assert r.status_code == 200

        try:
            events, full_text = _stream_chat_and_collect(
                demo_token,
                "Dame una acción concreta para reducir costos operativos.",
                timeout=120,
            )
            # Must include a meta event and at least a few message deltas
            assert events, "no SSE events received"
            assert events[0][0] == "meta", f"first event should be meta: {events[:3]}"
            message_events = [e for e in events if e[0] == "message"]
            error_events = [e for e in events if e[0] == "error"]
            assert not error_events, f"OpenRouter stream reported error: {error_events}"
            assert len(message_events) >= 3, f"expected 3+ deltas, got {len(message_events)}. text={full_text[:400]}"
            assert len(full_text) > 30, f"expected non-trivial content, got: {full_text!r}"
            assert any(e[0] == "done" for e in events), "must end with done"
        finally:
            # Reset config back to openai/gpt-4.1-mini regardless of outcome
            requests.put(f"{API}/admin/config", headers=H(admin_token), json={
                "provider": "openai", "model": "gpt-4.1-mini",
            }, timeout=15)

    def test_openai_default_stream_structured(self, admin_token, demo_token):
        # Ensure config is openai
        r = requests.put(f"{API}/admin/config", headers=H(admin_token), json={
            "provider": "openai", "model": "gpt-4.1-mini",
        }, timeout=15)
        assert r.status_code == 200

        events, full_text = _stream_chat_and_collect(
            demo_token,
            "¿Cómo mejorar la retención de clientes SaaS este trimestre?",
            timeout=120,
        )
        assert events, "no SSE events"
        assert events[0][0] == "meta", "first must be meta"
        assert any(e[0] == "done" for e in events)
        # Structured markers must appear
        assert "El Comité Estratégico analizó tu consulta" in full_text, full_text[:400]
        assert re.search(r"\[TAGS:", full_text), "missing [TAGS: marker"
        assert re.search(r"##\s*An[aá]lisis", full_text), "missing Análisis section"
        assert re.search(r"##\s*Conclusi[oó]n Estrat[eé]gica", full_text), "missing Conclusión section"
        assert re.search(r"##\s*Acciones Recomendadas", full_text), "missing Acciones section"
