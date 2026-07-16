# STRATELIQ · Product Requirements Document

## Original Problem Statement
Plataforma SaaS premium de consultoría estratégica impulsada por IA. No es un chatbot, es un **Comité Ejecutivo Virtual** que conoce el negocio del usuario y le ayuda a tomar mejores decisiones. Diseño extremadamente simple, elegante, Apple/Linear/Stripe-inspired. Mobile-first. Modo claro/oscuro con detección automática.

## User Personas
- Emprendedores y dueños de negocios
- CEOs y gerentes
- Profesionales independientes
- Perfil no técnico → interfaz debe ser intuitiva sin tutorial

## Architecture
- **Backend**: FastAPI + MongoDB. JWT (email/password) + Emergent Google Auth. SSE streaming chat.
- **Frontend**: React + Shadcn UI + Tailwind. Sidebar colapsable en desktop, bottom navigation en móvil. next-themes-like custom ThemeContext con persistencia en localStorage.
- **IA**: OpenAI `gpt-4.1-mini` vía `EMERGENT_LLM_KEY` (emergentintegrations.LlmChat.stream_message). Panel Admin permite cambiar proveedor (OpenAI/Anthropic/Gemini) y modelo.

## Core Requirements (static)
1. Landing (Hero, Beneficios, Cómo funciona, Testimonios, FAQ, CTA)
2. Auth (Email/Password JWT + Google OAuth)
3. Onboarding conversacional: 4 preguntas, una por pantalla
4. Dashboard con 4 bloques: saludo, caja de decisión, acciones rápidas, actividad reciente
5. Chat estructurado (intro fija + [TAGS] + Análisis + Conclusión Estratégica + Acciones Recomendadas)
6. Mi Empresa (memoria editable: empresa, objetivos, productos, clientes, competidores, mercado)
7. Historial estilo Gmail (búsqueda, eliminar, fecha)
8. Configuración (perfil, suscripción, notificaciones, sesión)
9. Panel Admin (cambiar modelo/proveedor)

## Implementation Log (2026-02-16)
- ✅ Backend completo: JWT + Google session flow, onboarding, company, streaming chat con SSE, conversations CRUD, admin config
- ✅ Frontend completo: 11 páginas, Shell responsivo, tema claro/oscuro con persistencia
- ✅ IA gpt-4.1-mini via EMERGENT_LLM_KEY funcionando con streaming
- ✅ Test users creados (demo + admin)
- ✅ Testing agent: Backend 100%, Frontend 100% después de 1 iteración de fixes en Chat.jsx

## Prioritized Backlog

### P0 (done)
- Landing, Auth, Onboarding, Dashboard, Chat (streaming + structured), Mi Empresa, Historial, Settings, Admin, Theme toggle, Responsive shell

### P1 (next)
- Password reset flow (email link)
- ErrorBoundary global para /app routes
- Streaming SSE con JSON envelope (`{"t":"..."}`) para robustez extra
- Añadir OpenRouter como proveedor adicional en Admin
- Suscripción con Stripe (plan pago)
- Notificaciones reales por email (resumen semanal)

### P2 (later)
- Compartir conversaciones (link público)
- Export PDF de conclusiones + acciones
- Múltiples empresas por usuario
- Onboarding con importación de datos desde web (URL de tu empresa)
- Analytics de decisiones tomadas

## Test Credentials
Ver `/app/memory/test_credentials.md`

## Environment
- `EMERGENT_LLM_KEY` en `/app/backend/.env`
- `JWT_SECRET` en `/app/backend/.env`
- MongoDB en `MONGO_URL` (default local)
