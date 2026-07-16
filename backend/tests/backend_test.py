"""STRATELIQ backend integration tests.

Covers:
- Health check
- Auth (register/login/me/logout/duplicate/wrong password)
- Onboarding + Company GET/PUT
- Profile update
- Admin config (RBAC + get/put + non-admin 403)
- Conversations listing/search/get/delete
- Chat SSE streaming (real Emergent Universal Key -> gpt-4.1-mini)
- Protected endpoints require auth (401)
"""
import os
import re
import time
import uuid
import json
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@strateliq.dev"
DEMO_PASSWORD = "Demo1234!"
ADMIN_EMAIL = "admin@strateliq.dev"
ADMIN_PASSWORD = "Admin1234!"


# -------- Fixtures --------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def demo_token():
    return _login(DEMO_EMAIL, DEMO_PASSWORD)


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


def H(token):
    return {"Authorization": f"Bearer {token}"}


# -------- Health --------
def test_health_root():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# -------- Auth --------
class TestAuth:
    def test_register_duplicate_email_returns_400(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": DEMO_EMAIL, "password": "whatever", "name": "x",
        }, timeout=15)
        assert r.status_code == 400
        assert "registrado" in r.json().get("detail", "").lower()

    def test_login_wrong_password_returns_401(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": DEMO_EMAIL, "password": "WRONG-PASSWORD"
        }, timeout=15)
        assert r.status_code == 401

    def test_login_and_me(self, demo_token):
        r = requests.get(f"{API}/auth/me", headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        me = r.json()
        assert me["email"] == DEMO_EMAIL
        assert "user_id" in me
        assert "onboarding_completed" in me

    def test_register_new_user_returns_token(self):
        email = f"test_{uuid.uuid4().hex[:8]}@strateliq.dev"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "TestPass123!", "name": "Test User TEST_"
        }, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["token"]
        assert data["user"]["email"] == email
        assert data["user"]["onboarding_completed"] is False
        # verify /me works with returned token
        me = requests.get(f"{API}/auth/me", headers=H(data["token"]), timeout=15)
        assert me.status_code == 200
        assert me.json()["email"] == email

    def test_logout_ok(self, demo_token):
        r = requests.post(f"{API}/auth/logout", headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_protected_without_token_returns_401(self):
        for path in ["/auth/me", "/company", "/conversations", "/admin/config"]:
            r = requests.get(f"{API}{path}", timeout=15)
            assert r.status_code == 401, f"{path} should require auth, got {r.status_code}"


# -------- Onboarding & Company --------
class TestOnboardingCompany:
    def test_onboarding_marks_user_complete(self):
        # Register a fresh user
        email = f"onb_{uuid.uuid4().hex[:8]}@strateliq.dev"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "TestPass123!", "name": "Onboard TEST_"
        }, timeout=15)
        token = r.json()["token"]
        me = requests.get(f"{API}/auth/me", headers=H(token), timeout=15).json()
        assert me["onboarding_completed"] is False

        onb_payload = {
            "company_name": "TEST_ACME",
            "what_you_sell": "software",
            "ideal_customer": "startups",
            "main_problem": "retention",
        }
        r = requests.post(f"{API}/onboarding", json=onb_payload, headers=H(token), timeout=15)
        assert r.status_code == 200

        me2 = requests.get(f"{API}/auth/me", headers=H(token), timeout=15).json()
        assert me2["onboarding_completed"] is True

        comp = requests.get(f"{API}/company", headers=H(token), timeout=15).json()
        assert comp["company_name"] == "TEST_ACME"
        assert comp["what_you_sell"] == "software"

    def test_company_update_persists(self, demo_token):
        payload = {
            "company_name": "TEST_Demo Co",
            "objectives": "grow to 1M ARR",
            "products": "AI advisor",
            "customers": "founders",
            "competitors": "none",
            "market": "LATAM",
        }
        r = requests.put(f"{API}/company", json=payload, headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        got = requests.get(f"{API}/company", headers=H(demo_token), timeout=15).json()
        for k, v in payload.items():
            assert got[k] == v


# -------- Profile --------
class TestProfile:
    def test_profile_update(self, demo_token):
        new_name = f"Demo Founder {uuid.uuid4().hex[:4]}"
        r = requests.put(f"{API}/profile", json={"name": new_name}, headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == new_name
        # Restore
        requests.put(f"{API}/profile", json={"name": "Demo Founder"}, headers=H(demo_token), timeout=15)


# -------- Admin config --------
class TestAdmin:
    def test_non_admin_forbidden(self, demo_token):
        r = requests.get(f"{API}/admin/config", headers=H(demo_token), timeout=15)
        assert r.status_code == 403

    def test_admin_get_and_put_config(self, admin_token):
        r = requests.get(f"{API}/admin/config", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        cfg = r.json()
        assert cfg["provider"] in ("openai", "anthropic", "gemini")
        assert isinstance(cfg["model"], str) and cfg["model"]

        r = requests.put(f"{API}/admin/config",
                         json={"provider": "openai", "model": "gpt-4.1-mini"},
                         headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json() == {"provider": "openai", "model": "gpt-4.1-mini"}


# -------- Chat + Conversations (real LLM call) --------
class TestChatAndConversations:
    conv_id = None
    full_text = ""

    def test_chat_stream_real_llm(self, demo_token):
        headers = H(demo_token)
        headers["Accept"] = "text/event-stream"
        payload = {"message": "¿Cómo puedo mejorar la retención de mis usuarios SaaS este trimestre?"}
        events = []
        conversation_id = None
        full_text = ""

        with requests.post(f"{API}/chat/stream", json=payload, headers=headers,
                           stream=True, timeout=90) as r:
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
                            # Per SSE spec strip exactly one leading U+0020
                            if v.startswith(" "):
                                v = v[1:]
                            data += v
                    events.append((event, data))
                    if event == "meta":
                        try:
                            conversation_id = json.loads(data).get("conversation_id")
                        except Exception:
                            pass
                    elif event == "message":
                        full_text += (data.replace("\\n", "\n")
                                          .replace('\\"', '"')
                                          .replace("\\\\", "\\"))
                    elif event == "done":
                        break
                if events and events[-1][0] == "done":
                    break

        # Validate SSE contract
        assert events[0][0] == "meta", f"first event should be meta, got {events[:2]}"
        assert conversation_id, "meta event must include conversation_id"
        assert any(e[0] == "message" for e in events), "must have data deltas"
        assert any(e[0] == "done" for e in events), "must end with done"

        # Real LLM output: must contain structured markers
        assert "El Comité Estratégico analizó tu consulta" in full_text, \
            f"missing intro line. text={full_text[:500]}"
        assert re.search(r"\[TAGS:", full_text), f"missing TAGS marker. text={full_text[:500]}"
        assert re.search(r"##\s*An[aá]lisis", full_text), "missing Análisis section"
        assert re.search(r"##\s*Conclusi[oó]n Estrat[eé]gica", full_text), "missing Conclusión section"
        assert re.search(r"##\s*Acciones Recomendadas", full_text), "missing Acciones section"

        TestChatAndConversations.conv_id = conversation_id
        TestChatAndConversations.full_text = full_text

    def test_conversation_persistence(self, demo_token):
        conv_id = TestChatAndConversations.conv_id
        assert conv_id, "requires previous chat test"
        r = requests.get(f"{API}/conversations", headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        convos = r.json()
        assert any(c["conversation_id"] == conv_id for c in convos)

        r = requests.get(f"{API}/conversations/{conv_id}", headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["conversation"]["conversation_id"] == conv_id
        assert len(data["messages"]) >= 2
        roles = [m["role"] for m in data["messages"]]
        assert "user" in roles and "assistant" in roles

    def test_conversation_search(self, demo_token):
        # Title starts with the first message text
        r = requests.get(f"{API}/conversations", params={"q": "retenci"},
                         headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        found = r.json()
        assert any("retenci" in c["title"].lower() for c in found)

    def test_conversation_delete(self, demo_token):
        conv_id = TestChatAndConversations.conv_id
        r = requests.delete(f"{API}/conversations/{conv_id}", headers=H(demo_token), timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/conversations/{conv_id}", headers=H(demo_token), timeout=15)
        assert r.status_code == 404
