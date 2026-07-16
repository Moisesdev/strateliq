from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Cookie, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import asyncio
import secrets
import logging
import uuid
import bcrypt
import jwt as pyjwt
import httpx
import resend
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------- MongoDB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY', '')
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------- App ----------
app = FastAPI(title="STRATELIQ API")
api_router = APIRouter(prefix="/api")

# ---------- Utility ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def create_jwt(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "iat": now_utc(),
        "exp": now_utc() + timedelta(days=7),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None),
):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    elif session_token:
        token = session_token

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Try JWT first
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if user:
            return user
    except Exception:
        pass

    # Fall back to Google session tokens stored in user_sessions
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------- Models ----------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class OnboardingInput(BaseModel):
    company_name: str
    what_you_sell: str
    ideal_customer: str
    main_problem: str


class CompanyInput(BaseModel):
    company_name: Optional[str] = ""
    objectives: Optional[str] = ""
    products: Optional[str] = ""
    customers: Optional[str] = ""
    competitors: Optional[str] = ""
    market: Optional[str] = ""


class ChatInput(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class AdminConfigInput(BaseModel):
    provider: Literal["openai", "anthropic", "gemini", "openrouter", "custom"]
    model: str


class ApiKeysInput(BaseModel):
    openai_key: Optional[str] = None
    openrouter_key: Optional[str] = None
    custom_key: Optional[str] = None
    custom_base_url: Optional[str] = None


class PlanUpdateInput(BaseModel):
    name: str
    amount: float
    currency: str = "usd"
    period_days: int = 30
    stripe_payment_link: Optional[str] = None
    features: Optional[List[str]] = None


class UserAdminUpdate(BaseModel):
    is_admin: Optional[bool] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None


# ---------- Auth Endpoints ----------
@api_router.post("/auth/register")
async def register(payload: RegisterInput, response: Response):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email ya registrado")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": payload.email.lower(),
        "name": payload.name,
        "picture": None,
        "password_hash": hash_password(payload.password),
        "auth_provider": "email",
        "onboarding_completed": False,
        "is_admin": False,
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(user_doc)
    token = create_jwt(user_id)
    response.set_cookie(
        "session_token", token, httponly=True, secure=True, samesite="none",
        path="/", max_age=7 * 24 * 3600,
    )
    return {
        "token": token,
        "user": {
            "user_id": user_id,
            "email": user_doc["email"],
            "name": user_doc["name"],
            "picture": None,
            "onboarding_completed": False,
            "is_admin": False,
        },
    }


@api_router.post("/auth/login")
async def login(payload: LoginInput, response: Response):
    user = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = create_jwt(user["user_id"])
    response.set_cookie(
        "session_token", token, httponly=True, secure=True, samesite="none",
        path="/", max_age=7 * 24 * 3600,
    )
    return {
        "token": token,
        "user": {
            "user_id": user["user_id"],
            "email": user["email"],
            "name": user["name"],
            "picture": user.get("picture"),
            "onboarding_completed": user.get("onboarding_completed", False),
            "is_admin": user.get("is_admin", False),
        },
    }


@api_router.post("/auth/session")
async def google_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")

    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()

    email = data["email"].lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"),
            "password_hash": None,
            "auth_provider": "google",
            "onboarding_completed": False,
            "is_admin": False,
            "created_at": iso(now_utc()),
        }
        await db.users.insert_one(user)
    else:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"picture": data.get("picture"), "name": user.get("name") or data.get("name")}},
        )

    session_token = data["session_token"]
    expires_at = now_utc() + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": iso(expires_at),
        "created_at": iso(now_utc()),
    })
    response.set_cookie(
        "session_token", session_token, httponly=True, secure=True, samesite="none",
        path="/", max_age=7 * 24 * 3600,
    )
    return {
        "user": {
            "user_id": user["user_id"],
            "email": user["email"],
            "name": user["name"],
            "picture": user.get("picture"),
            "onboarding_completed": user.get("onboarding_completed", False),
            "is_admin": user.get("is_admin", False),
        }
    }


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture"),
        "onboarding_completed": user.get("onboarding_completed", False),
        "is_admin": user.get("is_admin", False),
    }


@api_router.post("/auth/logout")
async def logout(response: Response, session_token: Optional[str] = Cookie(None)):
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------- Onboarding & Company ----------
@api_router.post("/onboarding")
async def submit_onboarding(payload: OnboardingInput, user=Depends(get_current_user)):
    company = {
        "user_id": user["user_id"],
        "company_name": payload.company_name,
        "what_you_sell": payload.what_you_sell,
        "ideal_customer": payload.ideal_customer,
        "main_problem": payload.main_problem,
        "objectives": "",
        "products": payload.what_you_sell,
        "customers": payload.ideal_customer,
        "competitors": "",
        "market": "",
        "updated_at": iso(now_utc()),
    }
    await db.companies.update_one(
        {"user_id": user["user_id"]}, {"$set": company}, upsert=True
    )
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"onboarding_completed": True}}
    )
    return {"ok": True}


@api_router.get("/company")
async def get_company(user=Depends(get_current_user)):
    company = await db.companies.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not company:
        return {
            "company_name": "", "objectives": "", "products": "",
            "customers": "", "competitors": "", "market": "",
            "what_you_sell": "", "ideal_customer": "", "main_problem": "",
        }
    return company


@api_router.put("/company")
async def update_company(payload: CompanyInput, user=Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = iso(now_utc())
    await db.companies.update_one(
        {"user_id": user["user_id"]}, {"$set": update}, upsert=True
    )
    company = await db.companies.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return company


# ---------- Admin Config ----------
DEFAULT_CONFIG = {"provider": "openai", "model": "gpt-4.1-mini"}


def _require_admin(user: dict):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Solo administradores")


async def get_llm_config():
    cfg = await db.admin_config.find_one({"_key": "llm"}, {"_id": 0})
    if not cfg:
        return DEFAULT_CONFIG
    return {"provider": cfg.get("provider", "openai"), "model": cfg.get("model", "gpt-4.1-mini")}


async def get_api_keys():
    """Return dict of provider -> key/base_url from DB, falling back to env."""
    doc = await db.admin_config.find_one({"_key": "api_keys"}, {"_id": 0}) or {}
    return {
        "openai_key": doc.get("openai_key") or "",
        "openrouter_key": doc.get("openrouter_key") or OPENROUTER_API_KEY,
        "custom_key": doc.get("custom_key") or "",
        "custom_base_url": doc.get("custom_base_url") or "",
    }


@api_router.get("/admin/config")
async def admin_get_config(user=Depends(get_current_user)):
    _require_admin(user)
    return await get_llm_config()


@api_router.put("/admin/config")
async def admin_set_config(payload: AdminConfigInput, user=Depends(get_current_user)):
    _require_admin(user)
    await db.admin_config.update_one(
        {"_key": "llm"},
        {"$set": {"provider": payload.provider, "model": payload.model, "updated_at": iso(now_utc())}},
        upsert=True,
    )
    return {"provider": payload.provider, "model": payload.model}


def _mask_key(k: str) -> str:
    if not k:
        return ""
    if len(k) <= 8:
        return "•" * len(k)
    return k[:4] + "•" * 8 + k[-4:]


@api_router.get("/admin/api-keys")
async def admin_get_api_keys(user=Depends(get_current_user)):
    _require_admin(user)
    keys = await get_api_keys()
    return {
        "openai_key_masked": _mask_key(keys["openai_key"]),
        "openrouter_key_masked": _mask_key(keys["openrouter_key"]),
        "custom_key_masked": _mask_key(keys["custom_key"]),
        "custom_base_url": keys["custom_base_url"],
        "has_openai": bool(keys["openai_key"]),
        "has_openrouter": bool(keys["openrouter_key"]),
        "has_custom": bool(keys["custom_key"] and keys["custom_base_url"]),
    }


@api_router.put("/admin/api-keys")
async def admin_set_api_keys(payload: ApiKeysInput, user=Depends(get_current_user)):
    _require_admin(user)
    updates = {"updated_at": iso(now_utc())}
    # Only overwrite provided fields; empty string means clear
    for field in ["openai_key", "openrouter_key", "custom_key", "custom_base_url"]:
        val = getattr(payload, field)
        if val is not None:
            updates[field] = val.strip()
    await db.admin_config.update_one(
        {"_key": "api_keys"}, {"$set": updates}, upsert=True,
    )
    return await admin_get_api_keys(user)


# --- Users management ---
@api_router.get("/admin/users")
async def admin_list_users(user=Depends(get_current_user), q: Optional[str] = None):
    _require_admin(user)
    query = {}
    if q:
        query = {"$or": [
            {"email": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
        ]}
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return users


@api_router.put("/admin/users/{user_id}")
async def admin_update_user(user_id: str, payload: UserAdminUpdate, user=Depends(get_current_user)):
    _require_admin(user)
    updates = {}
    if payload.is_admin is not None:
        # Prevent self-demotion to avoid lockout
        if user_id == user["user_id"] and payload.is_admin is False:
            raise HTTPException(status_code=400, detail="No puedes remover tus propios permisos de admin")
        updates["is_admin"] = payload.is_admin
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    result = await db.users.update_one({"user_id": user_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, user=Depends(get_current_user)):
    _require_admin(user)
    if user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")
    result = await db.users.delete_one({"user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    # Cleanup related data
    await db.companies.delete_many({"user_id": user_id})
    await db.conversations.delete_many({"user_id": user_id})
    await db.messages.delete_many({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.subscriptions.delete_many({"user_id": user_id})
    return {"ok": True}


# --- Plans management ---
@api_router.get("/admin/plans")
async def admin_list_plans(user=Depends(get_current_user)):
    _require_admin(user)
    return await get_plans_list()


@api_router.put("/admin/plans/{plan_id}")
async def admin_update_plan(plan_id: str, payload: PlanUpdateInput, user=Depends(get_current_user)):
    _require_admin(user)
    await seed_plans_if_empty()
    updates = payload.model_dump(exclude_none=True)
    updates["updated_at"] = iso(now_utc())
    result = await db.plans.update_one({"plan_id": plan_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return await db.plans.find_one({"plan_id": plan_id}, {"_id": 0})


@api_router.put("/profile")
async def update_profile(payload: ProfileUpdate, user=Depends(get_current_user)):
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {
        "user_id": updated["user_id"],
        "email": updated["email"],
        "name": updated["name"],
        "picture": updated.get("picture"),
    }


# ---------- Conversations ----------
@api_router.get("/conversations")
async def list_conversations(user=Depends(get_current_user), q: Optional[str] = None):
    query = {"user_id": user["user_id"]}
    if q:
        query["title"] = {"$regex": q, "$options": "i"}
    convos = await db.conversations.find(query, {"_id": 0}).sort("updated_at", -1).to_list(500)
    return convos


@api_router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user=Depends(get_current_user)):
    convo = await db.conversations.find_one(
        {"conversation_id": conversation_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not convo:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    messages = await db.messages.find(
        {"conversation_id": conversation_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    return {"conversation": convo, "messages": messages}


@api_router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user=Depends(get_current_user)):
    result = await db.conversations.delete_one(
        {"conversation_id": conversation_id, "user_id": user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    await db.messages.delete_many({"conversation_id": conversation_id})
    return {"ok": True}


# ---------- Chat ----------
def build_system_prompt(company: dict) -> str:
    return f"""Eres el Comité Ejecutivo Virtual de STRATELIQ: un grupo de asesores estratégicos senior en Marketing, Finanzas, Ventas y Operaciones. Analizas cada consulta desde múltiples perspectivas y entregas conclusiones ejecutivas claras, accionables y profesionales. No eres un chatbot; eres un consejero de negocios.

CONTEXTO DEL NEGOCIO DEL USUARIO:
- Empresa: {company.get('company_name') or 'No especificada'}
- Qué vende: {company.get('what_you_sell') or company.get('products') or 'No especificado'}
- Cliente ideal: {company.get('ideal_customer') or company.get('customers') or 'No especificado'}
- Problema principal actual: {company.get('main_problem') or 'No especificado'}
- Objetivos: {company.get('objectives') or 'No especificados'}
- Productos: {company.get('products') or 'No especificados'}
- Clientes: {company.get('customers') or 'No especificados'}
- Competidores: {company.get('competitors') or 'No especificados'}
- Mercado: {company.get('market') or 'No especificado'}

FORMATO OBLIGATORIO DE CADA RESPUESTA (exactamente en este orden y con estos marcadores):

El Comité Estratégico analizó tu consulta.

[TAGS: <lista separada por coma de áreas relevantes entre: Marketing, Finanzas, Ventas, Operaciones>]

## Análisis
<2-3 párrafos breves de análisis estratégico multidisciplinario, en español, tono ejecutivo>

## Conclusión Estratégica
<un párrafo claro y directo con la recomendación central>

## Acciones Recomendadas
1. <acción concreta y medible>
2. <acción concreta y medible>
3. <acción concreta y medible>
4. <opcional>
5. <opcional>

Reglas:
- Español, profesional pero cálido, sin jerga innecesaria.
- Nunca uses tablas ni código.
- Nunca digas "como IA".
- Si falta contexto, haz supuestos razonables y menciona brevemente lo que asumiste.
"""


async def stream_chat(user: dict, message: str, conversation_id: Optional[str]):
    # Ensure conversation exists
    company = await db.companies.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    cfg = await get_llm_config()

    if not conversation_id:
        conversation_id = f"conv_{uuid.uuid4().hex[:12]}"
        title = message.strip()[:60] + ("..." if len(message.strip()) > 60 else "")
        await db.conversations.insert_one({
            "conversation_id": conversation_id,
            "user_id": user["user_id"],
            "title": title,
            "created_at": iso(now_utc()),
            "updated_at": iso(now_utc()),
        })
    else:
        existing = await db.conversations.find_one(
            {"conversation_id": conversation_id, "user_id": user["user_id"]}
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Conversación no encontrada")

    # Persist user message
    await db.messages.insert_one({
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "conversation_id": conversation_id,
        "user_id": user["user_id"],
        "role": "user",
        "content": message,
        "created_at": iso(now_utc()),
    })

    # Load prior messages for context (last 20)
    prior = await db.messages.find(
        {"conversation_id": conversation_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)

    system_message = build_system_prompt(company)
    keys = await get_api_keys()

    def sse_data(text: str) -> str:
        safe = text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "")
        return f"data: {safe}\n\n"

    full_text = ""

    async def openai_compatible_stream(base_url: str, api_key: str, provider_label: str):
        """Stream from any OpenAI-compatible endpoint (OpenRouter, custom, etc)."""
        nonlocal full_text
        if not api_key:
            raise RuntimeError(f"{provider_label} API key no configurada. Configúrala en Admin → API Keys.")
        if not base_url:
            raise RuntimeError(f"{provider_label} base URL no configurada.")
        messages_payload = [{"role": "system", "content": system_message}]
        for m in prior:
            messages_payload.append({"role": m["role"], "content": m["content"]})
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://strateliq.app",
            "X-Title": "STRATELIQ",
        }
        url = base_url.rstrip("/") + "/chat/completions"
        body = {"model": cfg["model"], "messages": messages_payload, "stream": True}
        async with httpx.AsyncClient(timeout=120) as http_client:
            async with http_client.stream("POST", url, headers=headers, json=body) as resp:
                if resp.status_code != 200:
                    err_text = (await resp.aread()).decode(errors="ignore")[:400]
                    raise RuntimeError(f"{provider_label} {resp.status_code}: {err_text}")
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        obj = json.loads(data)
                        delta = obj.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    except Exception:
                        delta = ""
                    if delta:
                        full_text += delta
                        yield delta

    async def emergent_stream():
        nonlocal full_text
        # Prefer DB-stored OpenAI key when provider is openai and admin set one
        api_key = EMERGENT_LLM_KEY
        if cfg["provider"] == "openai" and keys.get("openai_key"):
            api_key = keys["openai_key"]
        chat = LlmChat(
            api_key=api_key,
            session_id=conversation_id,
            system_message=system_message,
        ).with_model(cfg["provider"], cfg["model"])
        async for ev in chat.stream_message(UserMessage(text=message)):
            if isinstance(ev, TextDelta):
                full_text += ev.content
                yield ev.content
            elif isinstance(ev, StreamDone):
                break

    async def generator():
        yield f"event: meta\ndata: {{\"conversation_id\": \"{conversation_id}\"}}\n\n"
        try:
            if cfg["provider"] == "openrouter":
                iterator = openai_compatible_stream(
                    "https://openrouter.ai/api/v1", keys["openrouter_key"], "OpenRouter"
                )
            elif cfg["provider"] == "custom":
                iterator = openai_compatible_stream(
                    keys["custom_base_url"], keys["custom_key"], "Custom"
                )
            else:
                iterator = emergent_stream()
            async for delta in iterator:
                yield sse_data(delta)
        except Exception as e:
            logger.exception("LLM stream error")
            err = str(e).replace("\"", "'")
            yield f"event: error\ndata: {err}\n\n"
        finally:
            await db.messages.insert_one({
                "message_id": f"msg_{uuid.uuid4().hex[:12]}",
                "conversation_id": conversation_id,
                "user_id": user["user_id"],
                "role": "assistant",
                "content": full_text,
                "created_at": iso(now_utc()),
            })
            await db.conversations.update_one(
                {"conversation_id": conversation_id},
                {"$set": {"updated_at": iso(now_utc())}},
            )
            yield "event: done\ndata: end\n\n"

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@api_router.post("/chat/stream")
async def chat_stream(payload: ChatInput, user=Depends(get_current_user)):
    return await stream_chat(user, payload.message, payload.conversation_id)


# ---------- Password Reset ----------
class ForgotPasswordInput(BaseModel):
    email: EmailStr
    frontend_origin: str


class ResetPasswordInput(BaseModel):
    token: str
    new_password: str


def send_email_async(to: str, subject: str, html: str):
    """Fire-and-forget email send via Resend. Uses threadpool to avoid blocking."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY missing, skipping email to %s", to)
        return
    params = {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html}
    try:
        return resend.Emails.send(params)
    except Exception:
        logger.exception("Resend email send failed")
        return None


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordInput):
    user = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    # Always return ok (avoid email enumeration)
    if not user or not user.get("password_hash"):
        return {"ok": True}

    token = secrets.token_urlsafe(32)
    expires_at = now_utc() + timedelta(hours=1)
    await db.password_resets.insert_one({
        "token": token,
        "user_id": user["user_id"],
        "expires_at": iso(expires_at),
        "used": False,
        "created_at": iso(now_utc()),
    })

    origin = payload.frontend_origin.rstrip("/")
    reset_link = f"{origin}/reset-password?token={token}"
    html = f"""
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0A0F1C">
      <div style="font-weight:800;font-size:20px;letter-spacing:-0.02em;margin-bottom:24px;color:#0066FF">STRATELIQ</div>
      <h1 style="font-size:22px;font-weight:600;margin:0 0 12px;letter-spacing:-0.02em">Recupera tu contraseña</h1>
      <p style="font-size:15px;line-height:1.6;color:#3B4252;margin:0 0 20px">Hola {user.get('name', 'ejecutivo')}, recibimos una solicitud para restablecer tu contraseña. Este enlace expira en 1 hora.</p>
      <a href="{reset_link}" style="display:inline-block;background:#0066FF;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:500;font-size:14px">Restablecer contraseña</a>
      <p style="font-size:13px;color:#8A94A6;margin:24px 0 0;line-height:1.6">Si no solicitaste este cambio, ignora este correo. Tu contraseña actual seguirá funcionando.</p>
      <p style="font-size:12px;color:#8A94A6;margin-top:32px;border-top:1px solid #E5E7EB;padding-top:16px">STRATELIQ · Comité Ejecutivo Virtual</p>
    </div>
    """
    await asyncio.to_thread(send_email_async, user["email"], "Restablece tu contraseña · STRATELIQ", html)
    return {"ok": True}


@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordInput):
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
    doc = await db.password_resets.find_one({"token": payload.token}, {"_id": 0})
    if not doc or doc.get("used"):
        raise HTTPException(status_code=400, detail="Enlace inválido o ya usado")
    expires_at = doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(status_code=400, detail="El enlace ha expirado")

    await db.users.update_one(
        {"user_id": doc["user_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    await db.password_resets.update_one(
        {"token": payload.token},
        {"$set": {"used": True, "used_at": iso(now_utc())}},
    )
    return {"ok": True}


# ---------- Subscription (Stripe) ----------
DEFAULT_PLANS = [
    {"plan_id": "inicial", "name": "Inicial", "amount": 1.00, "currency": "usd", "period_days": 30, "stripe_payment_link": None, "features": ["Consultas ilimitadas", "Export PDF", "Compartir conversaciones"], "order": 1},
    {"plan_id": "pro", "name": "Pro", "amount": 19.00, "currency": "usd", "period_days": 30, "stripe_payment_link": None, "features": ["Todo lo del plan Inicial", "Análisis multidisciplinario profundo", "Soporte prioritario"], "order": 2},
    {"plan_id": "max", "name": "Max", "amount": 49.00, "currency": "usd", "period_days": 30, "stripe_payment_link": None, "features": ["Todo lo del plan Pro", "Configuración de modelo IA avanzado", "Estrategia trimestral acompañada"], "order": 3},
]


async def seed_plans_if_empty():
    count = await db.plans.count_documents({})
    if count == 0:
        for p in DEFAULT_PLANS:
            await db.plans.insert_one({**p, "created_at": iso(now_utc())})


async def get_plans_list():
    plans = await db.plans.find({}, {"_id": 0}).sort("order", 1).to_list(50)
    if not plans:
        await seed_plans_if_empty()
        plans = await db.plans.find({}, {"_id": 0}).sort("order", 1).to_list(50)
    return plans


async def get_plan(plan_id: str):
    p = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0})
    if not p:
        await seed_plans_if_empty()
        p = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0})
    return p


class CheckoutInput(BaseModel):
    plan_id: str
    origin_url: str


@api_router.get("/plans")
async def list_plans_public():
    plans = await get_plans_list()
    return [{"id": p["plan_id"], **{k: v for k, v in p.items() if k != "plan_id"}} for p in plans]


@api_router.get("/subscription")
async def get_subscription(user=Depends(get_current_user)):
    sub = await db.subscriptions.find_one(
        {"user_id": user["user_id"], "status": "active"}, {"_id": 0}
    )
    if not sub:
        return {"plan_id": "free", "plan_name": "Free", "status": "free", "expires_at": None}
    expires_at = sub.get("expires_at")
    if isinstance(expires_at, str):
        exp = datetime.fromisoformat(expires_at)
    else:
        exp = expires_at
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < now_utc():
        await db.subscriptions.update_one({"user_id": user["user_id"], "status": "active"}, {"$set": {"status": "expired"}})
        return {"plan_id": "free", "plan_name": "Free", "status": "expired", "expires_at": iso(exp)}
    plan = await get_plan(sub["plan_id"])
    return {
        "plan_id": sub["plan_id"],
        "plan_name": plan["name"] if plan else sub["plan_id"],
        "status": "active",
        "expires_at": iso(exp) if exp else None,
    }


@api_router.post("/checkout/session")
async def create_checkout(payload: CheckoutInput, request: Request, user=Depends(get_current_user)):
    plan = await get_plan(payload.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Plan no encontrado")

    # If admin configured a Stripe Payment Link, use it directly
    if plan.get("stripe_payment_link"):
        # Track transaction as external
        session_id = f"link_{uuid.uuid4().hex[:12]}"
        await db.payment_transactions.insert_one({
            "session_id": session_id,
            "user_id": user["user_id"],
            "email": user["email"],
            "plan_id": payload.plan_id,
            "amount": plan["amount"],
            "currency": plan["currency"],
            "metadata": {"plan_id": payload.plan_id, "type": "payment_link"},
            "payment_status": "initiated",
            "status": "pending",
            "created_at": iso(now_utc()),
        })
        return {"url": plan["stripe_payment_link"], "session_id": session_id, "type": "payment_link"}

    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe no configurado")

    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/app/billing?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/app/billing?canceled=1"

    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    req = CheckoutSessionRequest(
        amount=plan["amount"],
        currency=plan["currency"],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["user_id"],
            "email": user["email"],
            "plan_id": payload.plan_id,
        },
    )
    session = await stripe_checkout.create_checkout_session(req)

    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "user_id": user["user_id"],
        "email": user["email"],
        "plan_id": payload.plan_id,
        "amount": plan["amount"],
        "currency": plan["currency"],
        "metadata": {"plan_id": payload.plan_id},
        "payment_status": "initiated",
        "status": "pending",
        "created_at": iso(now_utc()),
    })
    return {"url": session.url, "session_id": session.session_id, "type": "checkout"}


async def _activate_subscription(user_id: str, plan_id: str):
    plan = await get_plan(plan_id)
    if not plan:
        return
    expires_at = now_utc() + timedelta(days=plan.get("period_days", 30))
    # Deactivate previous
    await db.subscriptions.update_many(
        {"user_id": user_id, "status": "active"}, {"$set": {"status": "replaced"}},
    )
    await db.subscriptions.insert_one({
        "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "plan_id": plan_id,
        "status": "active",
        "started_at": iso(now_utc()),
        "expires_at": iso(expires_at),
    })


@api_router.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request, user=Depends(get_current_user)):
    tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")

    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    status = await stripe_checkout.get_checkout_status(session_id)

    # Only activate once
    already_paid = tx.get("payment_status") == "paid"
    if status.payment_status == "paid" and not already_paid:
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": status.payment_status,
                "status": status.status,
                "amount_total": status.amount_total,
                "updated_at": iso(now_utc()),
            }},
        )
        await _activate_subscription(user["user_id"], tx["plan_id"])
    else:
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": status.payment_status, "status": status.status, "updated_at": iso(now_utc())}},
        )
    return {
        "payment_status": status.payment_status,
        "status": status.status,
        "amount_total": status.amount_total,
        "currency": status.currency,
        "plan_id": tx["plan_id"],
    }


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    if not STRIPE_API_KEY:
        return {"ok": False}
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    try:
        evt = await stripe_checkout.handle_webhook(body, sig)
    except Exception:
        logger.exception("Stripe webhook error")
        return {"ok": False}

    if evt.payment_status == "paid":
        tx = await db.payment_transactions.find_one({"session_id": evt.session_id}, {"_id": 0})
        if tx and tx.get("payment_status") != "paid":
            await db.payment_transactions.update_one(
                {"session_id": evt.session_id},
                {"$set": {"payment_status": "paid", "status": "completed", "webhook_at": iso(now_utc())}},
            )
            await _activate_subscription(tx["user_id"], tx["plan_id"])
    return {"ok": True}


# Health
@api_router.get("/")
async def root():
    return {"message": "STRATELIQ API", "status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
