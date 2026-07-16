from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Cookie, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import bcrypt
import jwt as pyjwt
import httpx
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------- MongoDB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')

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
    provider: Literal["openai", "anthropic", "gemini"]
    model: str


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


async def get_llm_config():
    cfg = await db.admin_config.find_one({"_key": "llm"}, {"_id": 0})
    if not cfg:
        return DEFAULT_CONFIG
    return {"provider": cfg.get("provider", "openai"), "model": cfg.get("model", "gpt-4.1-mini")}


@api_router.get("/admin/config")
async def admin_get_config(user=Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Solo administradores")
    return await get_llm_config()


@api_router.put("/admin/config")
async def admin_set_config(payload: AdminConfigInput, user=Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Solo administradores")
    await db.admin_config.update_one(
        {"_key": "llm"},
        {"$set": {"provider": payload.provider, "model": payload.model, "updated_at": iso(now_utc())}},
        upsert=True,
    )
    return {"provider": payload.provider, "model": payload.model}


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
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=conversation_id,
        system_message=system_message,
    ).with_model(cfg["provider"], cfg["model"])

    # Send message with history: emergentintegrations manages history via session_id
    # but we send just the latest user message; the library keeps context per session.
    user_msg = UserMessage(text=message)

    full_text = ""

    async def generator():
        nonlocal full_text
        # Emit conversation_id first as a control event
        yield f"event: meta\ndata: {{\"conversation_id\": \"{conversation_id}\"}}\n\n"
        try:
            async for ev in chat.stream_message(user_msg):
                if isinstance(ev, TextDelta):
                    full_text += ev.content
                    # Escape newlines for SSE
                    safe = ev.content.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "")
                    yield f"data: {safe}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logger.exception("LLM stream error")
            err = str(e).replace("\"", "'")
            yield f"event: error\ndata: {err}\n\n"
        finally:
            # Persist assistant message
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

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
