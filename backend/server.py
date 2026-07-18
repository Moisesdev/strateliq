from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Cookie, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
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

# ---------- Supabase ----------
from supabase import create_async_client, AsyncClient
SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_KEY']
supabase: AsyncClient = None

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY', '')
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')
PAYPHONE_TOKEN = os.environ.get('PAYPHONE_TOKEN', '')
PAYPHONE_STORE_ID = os.environ.get('PAYPHONE_STORE_ID', '')

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------- App ----------
app = FastAPI(title="STRATELIQ API")
api_router = APIRouter(prefix="/api")

@app.on_event("startup")
async def startup_event():
    global supabase
    supabase = await create_async_client(SUPABASE_URL, SUPABASE_KEY)

# ---------- Utility ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


# ---------- Supabase Auth Verification ----------
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
        raise HTTPException(status_code=401, detail="No autenticado")

    try:
        res = await supabase.auth.get_user(token)
        if not res or not res.user:
            raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
        
        user = res.user
        email = user.email
        user_id = user.id
        
        is_admin = False
        if email == "admin@strateliq.dev":
            is_admin = True
        elif user.user_metadata and user.user_metadata.get("is_admin") is True:
            is_admin = True
            
        co_res = await supabase.table("companies").select("user_id").eq("user_id", user_id).execute()
        onboarding_completed = len(co_res.data) > 0

        return {
            "user_id": user_id,
            "email": email,
            "name": user.user_metadata.get("name") if user.user_metadata else email.split("@")[0],
            "picture": user.user_metadata.get("avatar_url") if user.user_metadata else None,
            "is_admin": is_admin,
            "onboarding_completed": onboarding_completed
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token inválido: {str(e)}")


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


# ---------- Models ----------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class RegistrationInput(BaseModel):
    free_registration_active: bool


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
    system_prompt: Optional[str] = None


class BrandingInput(BaseModel):
    logo_light: Optional[str] = None
    logo_dark: Optional[str] = None
    company_name: Optional[str] = "STRATELIQ"
    font_family: Optional[str] = "Exo 2"


class ApiKeysInput(BaseModel):
    openai_key: Optional[str] = None
    openrouter_key: Optional[str] = None
    custom_key: Optional[str] = None
    custom_base_url: Optional[str] = None


class PaymentGatewaysInput(BaseModel):
    stripe_api_key: Optional[str] = None
    payphone_token: Optional[str] = None
    payphone_store_id: Optional[str] = None


class PlanUpdateInput(BaseModel):
    name: str
    amount: float
    currency: str = "usd"
    period_days: int = 30
    stripe_payment_link: Optional[str] = None
    features: Optional[List[str]] = None
    active: Optional[bool] = True


class UserAdminUpdate(BaseModel):
    is_admin: Optional[bool] = None


class AdminChangePasswordInput(BaseModel):
    password: str


class AdminChangePlanInput(BaseModel):
    plan_id: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None


# ---------- Onboarding & Company ----------
@api_router.post("/onboarding")
async def submit_onboarding(payload: OnboardingInput, user=Depends(get_current_user)):
    # Validar si el registro gratuito está activo
    reg_res = await supabase.table("admin_config").select("value").eq("key", "registration").execute()
    free_reg_active = True
    if reg_res.data:
        free_reg_active = reg_res.data[0]["value"].get("free_registration_active", True)
        
    if not free_reg_active and not user.get("is_admin"):
        # Verificar si tiene una suscripción de pago activa
        sub_res = await supabase.table("subscriptions").select("status").eq("user_id", user["user_id"]).execute()
        has_paid_sub = False
        if sub_res.data:
            has_paid_sub = sub_res.data[0].get("status") not in ["free", None]
            
        if not has_paid_sub:
            raise HTTPException(
                status_code=403,
                detail="El registro gratuito está cerrado temporalmente. Adquiere un plan de pago para poder utilizar la plataforma."
            )

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
    await supabase.table("companies").upsert(company).execute()
    return {"ok": True}


@api_router.get("/company")
async def get_company(user=Depends(get_current_user)):
    res = await supabase.table("companies").select("*").eq("user_id", user["user_id"]).execute()
    company = res.data[0] if res.data else None
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
    update["user_id"] = user["user_id"]
    await supabase.table("companies").upsert(update).execute()
    res = await supabase.table("companies").select("*").eq("user_id", user["user_id"]).execute()
    company = res.data[0] if res.data else {}
    return company


# ---------- Admin Config ----------
DEFAULT_SYSTEM_PROMPT = """Eres el Comité Ejecutivo Virtual de STRATELIQ: un grupo de asesores estratégicos senior en Marketing, Finanzas, Ventas y Operaciones. Analizas cada consulta desde múltiples perspectivas y entregas conclusiones ejecutivas claras, accionables y profesionales. No eres un chatbot; eres un consejero de negocios.

CONTEXTO DEL NEGOCIO DEL USUARIO:
- Empresa: {company_name}
- Qué vende: {what_you_sell}
- Cliente ideal: {ideal_customer}
- Problema principal actual: {main_problem}
- Objetivos: {objectives}
- Productos: {products}
- Clientes: {customers}
- Competidores: {competitors}
- Mercado: {market}

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
- Si falta contexto, haz supuestos razonables y menciona brevemente lo que asumiste."""

DEFAULT_CONFIG = {
    "provider": "openai",
    "model": "gpt-4.1-mini",
    "system_prompt": DEFAULT_SYSTEM_PROMPT
}


def _require_admin(user: dict):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Solo administradores")


async def get_llm_config():
    res = await supabase.table("admin_config").select("value").eq("key", "llm").execute()
    if not res.data:
        return DEFAULT_CONFIG
    cfg = res.data[0]["value"]
    return {
        "provider": cfg.get("provider", "openai"),
        "model": cfg.get("model", "gpt-4.1-mini"),
        "system_prompt": cfg.get("system_prompt", DEFAULT_SYSTEM_PROMPT)
    }


@api_router.get("/admin/config")
async def admin_get_config(user=Depends(get_current_user)):
    _require_admin(user)
    return await get_llm_config()


@api_router.put("/admin/config")
async def admin_set_config(payload: AdminConfigInput, user=Depends(get_current_user)):
    _require_admin(user)
    value = {
        "provider": payload.provider,
        "model": payload.model,
        "system_prompt": payload.system_prompt,
        "updated_at": iso(now_utc())
    }
    await supabase.table("admin_config").upsert({"key": "llm", "value": value}).execute()
    return {
        "provider": payload.provider,
        "model": payload.model,
        "system_prompt": payload.system_prompt
    }


# ---------- Registration settings ----------
@api_router.get("/registration-status")
async def get_registration_status():
    res = await supabase.table("admin_config").select("value").eq("key", "registration").execute()
    if not res.data:
        return {"free_registration_active": True}
    return {
        "free_registration_active": res.data[0]["value"].get("free_registration_active", True)
    }


@api_router.get("/admin/registration")
async def admin_get_registration(user=Depends(get_current_user)):
    _require_admin(user)
    res = await supabase.table("admin_config").select("value").eq("key", "registration").execute()
    if not res.data:
        return {"free_registration_active": True}
    return {
        "free_registration_active": res.data[0]["value"].get("free_registration_active", True)
    }


@api_router.put("/admin/registration")
async def admin_set_registration(payload: RegistrationInput, user=Depends(get_current_user)):
    _require_admin(user)
    value = {
        "free_registration_active": payload.free_registration_active,
        "updated_at": iso(now_utc())
    }
    await supabase.table("admin_config").upsert({"key": "registration", "value": value}).execute()
    return {"free_registration_active": payload.free_registration_active}


@api_router.get("/branding")
async def get_branding():
    res = await supabase.table("admin_config").select("value").eq("key", "branding").execute()
    if not res.data:
        return {
            "logo_light": None,
            "logo_dark": None,
            "company_name": "STRATELIQ",
            "font_family": "Exo 2"
        }
    doc = res.data[0]["value"]
    return {
        "logo_light": doc.get("logo_light"),
        "logo_dark": doc.get("logo_dark"),
        "company_name": doc.get("company_name", "STRATELIQ"),
        "font_family": doc.get("font_family", "Exo 2")
    }


@api_router.put("/admin/branding")
async def admin_set_branding(payload: BrandingInput, user=Depends(get_current_user)):
    _require_admin(user)
    value = {
        "logo_light": payload.logo_light,
        "logo_dark": payload.logo_dark,
        "company_name": payload.company_name,
        "font_family": payload.font_family,
        "updated_at": iso(now_utc())
    }
    await supabase.table("admin_config").upsert({"key": "branding", "value": value}).execute()
    return {
        "logo_light": payload.logo_light,
        "logo_dark": payload.logo_dark,
        "company_name": payload.company_name,
        "font_family": payload.font_family
    }


def _mask_key(k: str) -> str:
    if not k:
        return ""
    if len(k) <= 8:
        return "•" * len(k)
    return k[:4] + "•" * 8 + k[-4:]


async def get_api_keys():
    """Return dict of provider -> key/base_url from DB, falling back to env."""
    res = await supabase.table("admin_config").select("value").eq("key", "api_keys").execute()
    doc = res.data[0]["value"] if res.data else {}
    return {
        "openai_key": doc.get("openai_key") or "",
        "openrouter_key": doc.get("openrouter_key") or OPENROUTER_API_KEY,
        "custom_key": doc.get("custom_key") or "",
        "custom_base_url": doc.get("custom_base_url") or "",
    }


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
    res = await supabase.table("admin_config").select("value").eq("key", "api_keys").execute()
    doc = res.data[0]["value"] if res.data else {}
    
    for field in ["openai_key", "openrouter_key", "custom_key", "custom_base_url"]:
        val = getattr(payload, field)
        if val is not None:
            doc[field] = val.strip()
            
    doc["updated_at"] = iso(now_utc())
    await supabase.table("admin_config").upsert({"key": "api_keys", "value": doc}).execute()
    return await admin_get_api_keys(user)


async def get_payment_gateways():
    """Return dict of payment gateway keys from DB, falling back to env."""
    res = await supabase.table("admin_config").select("value").eq("key", "payment_gateways").execute()
    doc = res.data[0]["value"] if res.data else {}
    return {
        "stripe_api_key": doc.get("stripe_api_key") or STRIPE_API_KEY,
        "payphone_token": doc.get("payphone_token") or PAYPHONE_TOKEN,
        "payphone_store_id": doc.get("payphone_store_id") or PAYPHONE_STORE_ID,
    }


@api_router.get("/admin/payment-gateways")
async def admin_get_payment_gateways(user=Depends(get_current_user)):
    _require_admin(user)
    gateways = await get_payment_gateways()
    return {
        "stripe_api_key_masked": _mask_key(gateways["stripe_api_key"]),
        "payphone_token_masked": _mask_key(gateways["payphone_token"]),
        "payphone_store_id": gateways["payphone_store_id"],
        "has_stripe": bool(gateways["stripe_api_key"]),
        "has_payphone": bool(gateways["payphone_token"] and gateways["payphone_store_id"]),
    }


@api_router.put("/admin/payment-gateways")
async def admin_set_payment_gateways(payload: PaymentGatewaysInput, user=Depends(get_current_user)):
    _require_admin(user)
    res = await supabase.table("admin_config").select("value").eq("key", "payment_gateways").execute()
    doc = res.data[0]["value"] if res.data else {}
    
    for field in ["stripe_api_key", "payphone_token", "payphone_store_id"]:
        val = getattr(payload, field)
        if val is not None:
            if val.strip().startswith("•"):
                continue
            doc[field] = val.strip()
            
    doc["updated_at"] = iso(now_utc())
    await supabase.table("admin_config").upsert({"key": "payment_gateways", "value": doc}).execute()
    return await admin_get_payment_gateways(user)


# --- Users management ---
@api_router.get("/admin/users")
async def admin_list_users(user=Depends(get_current_user), q: Optional[str] = None):
    _require_admin(user)
    try:
        # Consultar suscripciones activas de forma masiva para mapear planes
        sub_res = await supabase.table("subscriptions").select("user_id, plan_id").eq("status", "active").execute()
        user_plans = {item["user_id"]: item["plan_id"] for item in sub_res.data}

        res = await supabase.auth.admin.list_users()
        users_list = []
        for u in res:
            is_admin = False
            email = u.email or ""
            if email == "admin@strateliq.dev":
                is_admin = True
            elif u.user_metadata and u.user_metadata.get("is_admin") is True:
                is_admin = True
                
            name = None
            if u.user_metadata:
                name = u.user_metadata.get("name")
            if not name and email:
                name = email.split("@")[0]
            if not name:
                name = "Usuario"
                
            if q:
                query_lower = q.lower()
                if query_lower not in email.lower() and query_lower not in name.lower():
                    continue
                    
            users_list.append({
                "user_id": u.id,
                "email": email,
                "name": name,
                "picture": u.user_metadata.get("avatar_url") if u.user_metadata else None,
                "is_admin": is_admin,
                "created_at": u.created_at,
                "plan": user_plans.get(u.id) or "gratuito"
            })
        users_list.sort(key=lambda x: x["created_at"].isoformat() if x["created_at"] else "", reverse=True)
        return users_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No pudimos listar usuarios: {str(e)}")


@api_router.put("/admin/users/{user_id}")
async def admin_update_user(user_id: str, payload: UserAdminUpdate, user=Depends(get_current_user)):
    _require_admin(user)
    if payload.is_admin is not None:
        if user_id == user["user_id"] and payload.is_admin is False:
            raise HTTPException(status_code=400, detail="No puedes remover tus propios permisos de admin")
        try:
            u_res = await supabase.auth.admin.get_user_by_id(user_id)
            current_metadata = u_res.user.user_metadata or {}
            current_metadata["is_admin"] = payload.is_admin
            await supabase.auth.admin.update_user_by_id(
                user_id,
                attributes={"user_metadata": current_metadata}
            )
            return {
                "user_id": user_id,
                "email": u_res.user.email,
                "name": current_metadata.get("name") or u_res.user.email.split("@")[0],
                "is_admin": payload.is_admin
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error al actualizar permisos de admin: {str(e)}")
    raise HTTPException(status_code=400, detail="Nada que actualizar")


@api_router.put("/admin/users/{user_id}/password")
async def admin_change_password(user_id: str, payload: AdminChangePasswordInput, user=Depends(get_current_user)):
    _require_admin(user)
    try:
        await supabase.auth.admin.update_user_by_id(
            user_id,
            attributes={"password": payload.password}
        )
        return {"ok": True, "message": "Contraseña actualizada exitosamente"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo cambiar la contraseña: {str(e)}")


@api_router.put("/admin/users/{user_id}/plan")
async def admin_change_plan(user_id: str, payload: AdminChangePlanInput, user=Depends(get_current_user)):
    _require_admin(user)
    if payload.plan_id.lower() == "gratuito":
        # Desactivar suscripciones activas
        await supabase.table("subscriptions").update({"status": "replaced"}).eq("user_id", user_id).eq("status", "active").execute()
        return {"ok": True, "plan": "gratuito"}
        
    res = await supabase.table("plans").select("*").eq("plan_id", payload.plan_id).execute()
    plan = res.data[0] if res.data else None
    if not plan:
        raise HTTPException(status_code=400, detail="Plan no encontrado")
        
    expires_at = now_utc() + timedelta(days=plan.get("period_days", 30))
    await supabase.table("subscriptions").update({"status": "replaced"}).eq("user_id", user_id).eq("status", "active").execute()
    await supabase.table("subscriptions").upsert({
        "user_id": user_id,
        "plan_id": payload.plan_id,
        "status": "active",
        "expires_at": iso(expires_at),
        "updated_at": iso(now_utc())
    }).execute()
    return {"ok": True, "plan": payload.plan_id}


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, user=Depends(get_current_user)):
    _require_admin(user)
    if user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")
    try:
        await supabase.auth.admin.delete_user(user_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar usuario: {str(e)}")


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
    updates["plan_id"] = plan_id
    await supabase.table("plans").upsert(updates).execute()
    res = await supabase.table("plans").select("*").eq("plan_id", plan_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return res.data[0]


@api_router.put("/profile")
async def update_profile(payload: ProfileUpdate, user=Depends(get_current_user)):
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if updates:
        await supabase.auth.admin.update_user_by_id(
            user["user_id"],
            attributes={"user_metadata": updates}
        )
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": payload.name or user["name"],
        "picture": user.get("picture"),
    }


# ---------- Conversations ----------
@api_router.get("/conversations")
async def list_conversations(user=Depends(get_current_user), q: Optional[str] = None):
    stmt = supabase.table("conversations").select("*").eq("user_id", user["user_id"])
    if q:
        stmt = stmt.ilike("title", f"%{q}%")
    res = await stmt.order("updated_at", desc=True).limit(500).execute()
    return res.data


@api_router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user=Depends(get_current_user)):
    c_res = await supabase.table("conversations").select("*").eq("conversation_id", conversation_id).eq("user_id", user["user_id"]).execute()
    if not c_res.data:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    m_res = await supabase.table("messages").select("*").eq("conversation_id", conversation_id).order("created_at").limit(1000).execute()
    return {"conversation": c_res.data[0], "messages": m_res.data}


@api_router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user=Depends(get_current_user)):
    res = await supabase.table("conversations").delete().eq("conversation_id", conversation_id).eq("user_id", user["user_id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    await supabase.table("messages").delete().eq("conversation_id", conversation_id).execute()
    return {"ok": True}


# ---------- Chat ----------
def build_system_prompt(company: dict, custom_prompt: str = None) -> str:
    prompt_template = custom_prompt or DEFAULT_SYSTEM_PROMPT
    return prompt_template.replace(
        "{company_name}", company.get('company_name') or 'No especificada'
    ).replace(
        "{what_you_sell}", company.get('what_you_sell') or company.get('products') or 'No especificado'
    ).replace(
        "{ideal_customer}", company.get('ideal_customer') or company.get('customers') or 'No especificado'
    ).replace(
        "{main_problem}", company.get('main_problem') or 'No especificado'
    ).replace(
        "{objectives}", company.get('objectives') or 'No especificados'
    ).replace(
        "{products}", company.get('products') or 'No especificados'
    ).replace(
        "{customers}", company.get('customers') or 'No especificados'
    ).replace(
        "{competitors}", company.get('competitors') or 'No especificados'
    ).replace(
        "{market}", company.get('market') or 'No especificado'
    )


async def stream_chat(user: dict, message: str, conversation_id: Optional[str]):
    res_company = await supabase.table("companies").select("*").eq("user_id", user["user_id"]).execute()
    company = res_company.data[0] if res_company.data else {}
    cfg = await get_llm_config()

    if not conversation_id:
        conversation_id = f"conv_{uuid.uuid4().hex[:12]}"
        title = message.strip()[:60] + ("..." if len(message.strip()) > 60 else "")
        await supabase.table("conversations").insert({
            "conversation_id": conversation_id,
            "user_id": user["user_id"],
            "title": title,
            "created_at": iso(now_utc()),
            "updated_at": iso(now_utc()),
        }).execute()
    else:
        existing_res = await supabase.table("conversations").select("conversation_id").eq("conversation_id", conversation_id).eq("user_id", user["user_id"]).execute()
        if not existing_res.data:
            raise HTTPException(status_code=404, detail="Conversación no encontrada")

    await supabase.table("messages").insert({
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "conversation_id": conversation_id,
        "user_id": user["user_id"],
        "role": "user",
        "content": message,
        "created_at": iso(now_utc()),
    }).execute()

    prior_res = await supabase.table("messages").select("*").eq("conversation_id", conversation_id).order("created_at").limit(50).execute()
    prior = prior_res.data

    system_message = build_system_prompt(company, cfg.get("system_prompt"))
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
            await supabase.table("messages").insert({
                "message_id": f"msg_{uuid.uuid4().hex[:12]}",
                "conversation_id": conversation_id,
                "user_id": user["user_id"],
                "role": "assistant",
                "content": full_text,
                "created_at": iso(now_utc()),
            }).execute()
            await supabase.table("conversations").update({
                "updated_at": iso(now_utc())
            }).eq("conversation_id", conversation_id).execute()
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
# Los flujos de recuperación y cambio de contraseña son administrados nativamente por Supabase Auth en el cliente.


# ---------- Subscription (Stripe) ----------
DEFAULT_PLANS = [
    {"plan_id": "inicial", "name": "Inicial", "amount": 1.00, "currency": "usd", "period_days": 30, "stripe_payment_link": None, "features": ["Consultas ilimitadas", "Export PDF", "Compartir conversaciones"], "order": 1, "active": True},
    {"plan_id": "pro", "name": "Pro", "amount": 19.00, "currency": "usd", "period_days": 30, "stripe_payment_link": None, "features": ["Todo lo del plan Inicial", "Análisis multidisciplinario profundo", "Soporte prioritario"], "order": 2, "active": True},
    {"plan_id": "max", "name": "Max", "amount": 49.00, "currency": "usd", "period_days": 30, "stripe_payment_link": None, "features": ["Todo lo del plan Pro", "Configuración de modelo IA avanzado", "Estrategia trimestral acompañada"], "order": 3, "active": True},
]


async def seed_plans_if_empty():
    res = await supabase.table("plans").select("plan_id").execute()
    if not res.data:
        for p in DEFAULT_PLANS:
            await supabase.table("plans").insert(p).execute()


async def get_plans_list():
    res = await supabase.table("plans").select("*").order("order").execute()
    plans = res.data
    if not plans:
        await seed_plans_if_empty()
        res = await supabase.table("plans").select("*").order("order").execute()
        plans = res.data
    return plans


async def get_plan(plan_id: str):
    res = await supabase.table("plans").select("*").eq("plan_id", plan_id).execute()
    p = res.data[0] if res.data else None
    if not p:
        await seed_plans_if_empty()
        res = await supabase.table("plans").select("*").eq("plan_id", plan_id).execute()
        p = res.data[0] if res.data else None
    return p


class CheckoutInput(BaseModel):
    plan_id: str
    origin_url: str


@api_router.get("/plans")
async def list_plans_public():
    plans = await get_plans_list()
    active_plans = [p for p in plans if p.get("active", True)]
    return [{"id": p["plan_id"], **{k: v for k, v in p.items() if k != "plan_id"}} for p in active_plans]


@api_router.get("/subscription")
async def get_subscription(user=Depends(get_current_user)):
    res = await supabase.table("subscriptions").select("*").eq("user_id", user["user_id"]).eq("status", "active").execute()
    sub = res.data[0] if res.data else None
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
        await supabase.table("subscriptions").update({"status": "expired"}).eq("user_id", user["user_id"]).eq("status", "active").execute()
        return {"plan_id": "free", "plan_name": "Free", "status": "expired", "expires_at": iso(exp)}
    plan = await get_plan(sub["plan_id"])
    return {
        "plan_id": sub["plan_id"],
        "plan_name": plan["name"] if plan else sub["plan_id"],
        "status": "active",
        "expires_at": iso(exp) if exp else None,
    }


class PayphoneSessionInput(BaseModel):
    plan_id: str


class PayphoneConfirmInput(BaseModel):
    id: int
    clientTransactionId: str


@api_router.post("/checkout/session/payphone")
async def create_payphone_session(payload: PayphoneSessionInput, user=Depends(get_current_user)):
    gateways = await get_payment_gateways()
    payphone_token = gateways["payphone_token"]
    payphone_store_id = gateways["payphone_store_id"]
    
    if not payphone_token or not payphone_store_id:
        raise HTTPException(status_code=500, detail="PayPhone no está configurado en el servidor")

    plan = await get_plan(payload.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Plan no encontrado")

    # Generate unique transaction ID
    client_tx_id = f"pp_tx_{user['user_id'][:8]}_{payload.plan_id}_{uuid.uuid4().hex[:8]}"

    amount_cents = int(plan["amount"] * 100)

    # Insert into payment_transactions to track
    await supabase.table("payment_transactions").insert({
        "session_id": client_tx_id,
        "user_id": user["user_id"],
        "email": user["email"],
        "plan_id": payload.plan_id,
        "amount": plan["amount"],
        "currency": plan["currency"].upper(),
        "payment_status": "initiated",
        "status": "pending",
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc())
    }).execute()

    return {
        "token": payphone_token,
        "storeId": payphone_store_id,
        "clientTransactionId": client_tx_id,
        "amount": amount_cents,
        "amountWithoutTax": amount_cents,
        "amountWithTax": 0,
        "tax": 0,
        "currency": plan["currency"].upper(),
        "reference": f"Suscripción plan {plan['name']}"
    }


@api_router.post("/checkout/confirm/payphone")
async def confirm_payphone_payment(payload: PayphoneConfirmInput, user=Depends(get_current_user)):
    gateways = await get_payment_gateways()
    payphone_token = gateways["payphone_token"]
    
    if not payphone_token:
        raise HTTPException(status_code=500, detail="PayPhone no está configurado en el servidor")

    # Search transaction by clientTransactionId and user_id to ensure ownership
    tx_res = await supabase.table("payment_transactions").select("*").eq("session_id", payload.clientTransactionId).eq("user_id", user["user_id"]).execute()
    tx = tx_res.data[0] if tx_res.data else None
    if not tx:
        raise HTTPException(status_code=404, detail="Transacción de pago no encontrada o no pertenece al usuario")

    if tx.get("payment_status") == "paid":
        return {"ok": True, "status": "Approved", "message": "El pago ya fue verificado e instalado anteriormente"}

    # Call PayPhone API to confirm
    confirm_url = "https://paymentbox.payphonetodoesposible.com/api/confirm"
    headers = {
        "Authorization": f"Bearer {payphone_token}",
        "Content-Type": "application/json"
    }
    data = {
        "id": payload.id,
        "clientTxId": payload.clientTransactionId
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(confirm_url, headers=headers, json=data, timeout=10.0)
            if resp.status_code != 200:
                logger.error(f"PayPhone API returned status code {resp.status_code}: {resp.text}")
                raise HTTPException(status_code=400, detail=f"Error al consultar estado de pago en PayPhone: {resp.text}")
            
            resp_data = resp.json()
            tx_status = resp_data.get("transactionStatus")
            
            if tx_status == "Approved":
                # Update transaction status
                await supabase.table("payment_transactions").update({
                    "payment_status": "paid",
                    "status": "completed",
                    "updated_at": iso(now_utc())
                }).eq("session_id", payload.clientTransactionId).execute()

                # Activate subscription
                await _activate_subscription(user["user_id"], tx["plan_id"])
                
                # Send confirmation email via Resend if enabled
                if RESEND_API_KEY and user["email"]:
                    try:
                        resend.Emails.send({
                            "from": SENDER_EMAIL,
                            "to": user["email"],
                            "subject": "¡Tu suscripción en STRATELIQ está activa!",
                            "html": f"<p>Hola {user['name']},</p><p>Tu pago ha sido procesado con éxito a través de PayPhone. Ya tienes activo el plan <strong>{tx['plan_id'].upper()}</strong>.</p><p>¡Gracias por confiar en STRATELIQ!</p>"
                        })
                    except Exception as e:
                        logger.error(f"Error sending email via Resend: {e}")

                return {"ok": True, "status": "Approved", "message": "Pago aprobado y suscripción activada"}
            else:
                # Update status with failed state
                await supabase.table("payment_transactions").update({
                    "payment_status": tx_status.lower() if tx_status else "failed",
                    "status": "failed",
                    "updated_at": iso(now_utc())
                }).eq("session_id", payload.clientTransactionId).execute()
                return {"ok": False, "status": tx_status, "message": f"El pago no fue aprobado: {tx_status}"}

    except httpx.RequestError as exc:
        logger.error(f"HTTP Request failed while calling PayPhone: {exc}")
        raise HTTPException(status_code=500, detail="Error de comunicación con el servidor de PayPhone")


@api_router.post("/checkout/session")
async def create_checkout(payload: CheckoutInput, request: Request, user=Depends(get_current_user)):
    plan = await get_plan(payload.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Plan no encontrado")

    if plan.get("stripe_payment_link"):
        session_id = f"link_{uuid.uuid4().hex[:12]}"
        await supabase.table("payment_transactions").insert({
            "session_id": session_id,
            "user_id": user["user_id"],
            "email": user["email"],
            "plan_id": payload.plan_id,
            "amount": plan["amount"],
            "currency": plan["currency"],
            "payment_status": "initiated",
            "status": "pending",
            "created_at": iso(now_utc()),
            "updated_at": iso(now_utc())
        }).execute()
        return {"url": plan["stripe_payment_link"], "session_id": session_id, "type": "payment_link"}

    gateways = await get_payment_gateways()
    stripe_key = gateways["stripe_api_key"]
    if not stripe_key:
        raise HTTPException(status_code=500, detail="Stripe no configurado")

    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/app/billing?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/app/billing?canceled=1"

    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)

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

    await supabase.table("payment_transactions").insert({
        "session_id": session.session_id,
        "user_id": user["user_id"],
        "email": user["email"],
        "plan_id": payload.plan_id,
        "amount": plan["amount"],
        "currency": plan["currency"],
        "payment_status": "initiated",
        "status": "pending",
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc())
    }).execute()
    return {"url": session.url, "session_id": session.session_id, "type": "checkout"}


async def _activate_subscription(user_id: str, plan_id: str):
    plan = await get_plan(plan_id)
    if not plan:
        return
    expires_at = now_utc() + timedelta(days=plan.get("period_days", 30))
    await supabase.table("subscriptions").update({"status": "replaced"}).eq("user_id", user_id).eq("status", "active").execute()
    await supabase.table("subscriptions").upsert({
        "user_id": user_id,
        "plan_id": plan_id,
        "status": "active",
        "expires_at": iso(expires_at),
        "updated_at": iso(now_utc())
    }).execute()


@api_router.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request, user=Depends(get_current_user)):
    tx_res = await supabase.table("payment_transactions").select("*").eq("session_id", session_id).eq("user_id", user["user_id"]).execute()
    tx = tx_res.data[0] if tx_res.data else None
    if not tx:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")

    gateways = await get_payment_gateways()
    stripe_key = gateways["stripe_api_key"]
    if not stripe_key:
        raise HTTPException(status_code=500, detail="Stripe no configurado")

    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)
    status = await stripe_checkout.get_checkout_status(session_id)

    already_paid = tx.get("payment_status") == "paid"
    if status.payment_status == "paid" and not already_paid:
        await supabase.table("payment_transactions").update({
            "payment_status": status.payment_status,
            "status": status.status,
            "updated_at": iso(now_utc())
        }).eq("session_id", session_id).execute()
        await _activate_subscription(user["user_id"], tx["plan_id"])
    else:
        await supabase.table("payment_transactions").update({
            "payment_status": status.payment_status,
            "status": status.status,
            "updated_at": iso(now_utc())
        }).eq("session_id", session_id).execute()
    return {
        "payment_status": status.payment_status,
        "status": status.status,
        "amount_total": status.amount_total,
        "currency": status.currency,
        "plan_id": tx["plan_id"],
    }


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    gateways = await get_payment_gateways()
    stripe_key = gateways["stripe_api_key"]
    if not stripe_key:
        return {"ok": False}
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)
    try:
        evt = await stripe_checkout.handle_webhook(body, sig)
    except Exception:
        logger.exception("Stripe webhook error")
        return {"ok": False}

    if evt.payment_status == "paid":
        tx_res = await supabase.table("payment_transactions").select("*").eq("session_id", evt.session_id).execute()
        tx = tx_res.data[0] if tx_res.data else None
        if tx and tx.get("payment_status") != "paid":
            await supabase.table("payment_transactions").update({
                "payment_status": "paid",
                "status": "completed",
                "updated_at": iso(now_utc())
            }).eq("session_id", evt.session_id).execute()
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
