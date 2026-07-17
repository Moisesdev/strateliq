import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Brain, ShieldCheck, Zap, Building2, LineChart, Users, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/context/AuthContext";

const BENEFITS = [
  {
    icon: Brain,
    title: "Comité Ejecutivo Virtual",
    desc: "No es un chatbot. Es un consejo de asesores que analiza tu negocio desde marketing, finanzas, ventas y operaciones.",
  },
  {
    icon: Sparkles,
    title: "Memoria de tu negocio",
    desc: "Recuerda tu empresa, clientes, productos y objetivos. Mientras más lo usas, mejores recomendaciones entrega.",
  },
  {
    icon: ShieldCheck,
    title: "Decisiones con confianza",
    desc: "Cada consulta termina en una conclusión estratégica y acciones concretas y medibles.",
  },
  {
    icon: Zap,
    title: "Simple y rápido",
    desc: "Pregunta, obtén respuesta. Sin dashboards intimidantes. Sin curva de aprendizaje.",
  },
];

const STEPS = [
  { n: "01", title: "Cuéntanos tu negocio", desc: "Una entrevista breve. Cuatro preguntas. Sin formularios eternos." },
  { n: "02", title: "Consulta al Comité", desc: "Pregunta lo que necesites decidir hoy. Recibirás análisis estratégico multidisciplinario." },
  { n: "03", title: "Ejecuta y mide", desc: "Cada respuesta trae acciones concretas. Vuelve cuando necesites la siguiente decisión." },
];

const TESTIMONIALS = [
  { name: "Moisés R.", role: "CEO · Marca de moda", text: "Sentí que tenía un consultor estratégico disponible 24/7. Las recomendaciones son claras y aplicables." },
  { name: "Andrea L.", role: "Fundadora · SaaS B2B", text: "Dejé de sentirme sola tomando decisiones. STRATELIQ me ayuda a pensar como un comité completo." },
  { name: "Diego M.", role: "Gerente General", text: "En 5 minutos tuve un plan de acción para reducir costos. Impresionante." },
];

const FAQ = [
  { q: "¿Es un chatbot como ChatGPT?", a: "No. STRATELIQ es un Comité Ejecutivo Virtual entrenado para pensar como un consejo de asesores. Analiza cada consulta desde marketing, finanzas, ventas y operaciones, y entrega conclusiones ejecutivas accionables." },
  { q: "¿Guardan la información de mi empresa?", a: "Sí, tu negocio se guarda de forma segura y privada para que las recomendaciones sean cada vez más precisas. Puedes editarla o borrarla en cualquier momento." },
  { q: "¿Necesito ser experto en tecnología?", a: "No. STRATELIQ está diseñado para que cualquier emprendedor, dueño de negocio o gerente pueda usarlo sin tutorial." },
  { q: "¿Puedo usarlo en el celular?", a: "Sí. STRATELIQ es 100% responsive y funciona perfecto en móvil, tablet, laptop y escritorio." },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const [plans, setPlans] = useState([]);
  const [freeRegActive, setFreeRegActive] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [plansRes, regRes] = await Promise.all([
          api.get("/plans"),
          api.get("/registration-status")
        ]);
        if (plansRes && Array.isArray(plansRes.data)) {
          setPlans(plansRes.data.filter(p => p.active !== false));
        }
        if (regRes && regRes.data) {
          setFreeRegActive(!!regRes.data.free_registration_active);
        }
      } catch (e) {
        console.error("Error loading landing data:", e);
      }
    })();
  }, []);

  const handleStartNavigation = (e) => {
    if (!freeRegActive) {
      e.preventDefault();
      document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 glass border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-5 md:px-8 h-16">
          <Logo />
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            {!loading && user ? (
              <div className="flex items-center gap-3">
                <Link to="/app">
                  <Button variant="ghost" size="sm" className="rounded-full gap-1.5">
                    Consola
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                </Link>
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-secondary text-xs font-semibold text-foreground select-none">
                  {user.name 
                    ? user.name.split(" ").map(n => n[0]).join("").toUpperCase() 
                    : (user.email ? user.email[0].toUpperCase() : "?")}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 md:gap-3">
                <Link to="/login">
                  <Button variant="ghost" size="sm" data-testid="landing-login-link">Iniciar sesión</Button>
                </Link>
                <Link to="/register" onClick={handleStartNavigation}>
                  <Button size="sm" data-testid="landing-signup-link" className="rounded-full">Empezar</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg pointer-events-none" aria-hidden />
        <div className="relative max-w-5xl mx-auto px-5 md:px-8 pt-20 md:pt-32 pb-20 md:pb-32">
          <div className="max-w-3xl animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
              Nuevo · Comité Ejecutivo Virtual con IA
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter leading-[1.05] text-foreground">
              Un comité de asesores estratégicos.<br />
              <span className="text-muted-foreground">Disponible cuando lo necesites.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">
              STRATELIQ no es un chatbot. Es tu Comité Ejecutivo Virtual: conoce tu negocio y te ayuda a tomar mejores decisiones en marketing, finanzas, ventas y operaciones.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {!loading && user ? (
                <Link to="/app">
                  <Button size="lg" className="rounded-full h-12 px-6 text-base" data-testid="hero-cta-btn">
                    Ir a la consola
                    <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.75} />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/register" onClick={handleStartNavigation}>
                    <Button size="lg" className="rounded-full h-12 px-6 text-base" data-testid="hero-cta-btn">
                      Empezar Ahora
                      <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.75} />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button size="lg" variant="ghost" className="rounded-full h-12 px-6 text-base" data-testid="hero-login-btn">
                      Ya tengo cuenta
                    </Button>
                  </Link>
                </>
              )}
            </div>
            <div className="mt-10 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Diseñado para emprendedores · CEOs · gerentes · profesionales
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-t border-border/50">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-20 md:py-28">
          <div className="max-w-2xl mb-14">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Beneficios</div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              Menos ruido. Más criterio.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
            {BENEFITS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="group">
                <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center mb-4 border border-border/60">
                  <Icon className="h-[18px] w-[18px] text-primary" strokeWidth={1.5} />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{title}</h3>
                <p className="text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/50 bg-secondary/30">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-20 md:py-28">
          <div className="max-w-2xl mb-14">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Cómo funciona</div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              Tres pasos. Cero fricción.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map(({ n, title, desc }) => (
              <div key={n} className="rounded-2xl border border-border/60 bg-card p-8">
                <div className="text-xs font-mono text-muted-foreground mb-6">{n}</div>
                <h3 className="font-display text-lg font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-border/50">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-20 md:py-28">
          <div className="max-w-2xl mb-14">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Testimonios</div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              Personas reales. Decisiones mejores.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="rounded-2xl border border-border/60 bg-card p-6 md:p-8">
                <p className="text-base leading-relaxed text-foreground">&ldquo;{t.text}&rdquo;</p>
                <div className="mt-6 flex items-center gap-3">
                  <Avatar className="h-9 w-9 border border-border/60">
                    <AvatarFallback className="text-xs bg-secondary">{t.name.split(" ").map((s) => s[0]).join("")}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing / Planes */}
      <section id="pricing" className="border-t border-border/50 bg-background/50">
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-20 md:py-28">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Planes y Precios</div>
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight leading-[1.1]">
              Elige el plan ideal para impulsar tu negocio.
            </h2>
            <p className="mt-4 text-muted-foreground text-sm leading-relaxed">
              Consigue asesoramiento estratégico constante y personalizado. Acceso inmediato a tu Comité Ejecutivo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {plans.map((p) => (
              <div
                key={p.plan_id}
                className={cn(
                  "rounded-2xl border bg-card p-6 md:p-8 flex flex-col justify-between space-y-6 transition-all duration-200 hover:border-border",
                  p.name.toLowerCase().includes("premium") || p.name.toLowerCase().includes("pro")
                    ? "border-primary/40 shadow-sm"
                    : "border-border/60"
                )}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-semibold">{p.name}</h3>
                    {p.name.toLowerCase().includes("premium") || p.name.toLowerCase().includes("pro") ? (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                        Recomendado
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">${p.amount}</span>
                    <span className="text-sm font-normal text-muted-foreground">/{p.period_days === 30 ? "mes" : `${p.period_days} días`}</span>
                  </div>
                  <div className="h-px bg-border/40" />
                  <ul className="space-y-2.5 text-sm">
                    {(p.features || []).map((f, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-muted-foreground">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" strokeWidth={2} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-4">
                  {p.stripe_payment_link ? (
                    <a href={p.stripe_payment_link} target="_blank" rel="noopener noreferrer" className="w-full">
                      <Button className="w-full h-11 rounded-full font-medium" variant={p.name.toLowerCase().includes("premium") || p.name.toLowerCase().includes("pro") ? "default" : "outline"}>
                        Adquirir Plan
                        <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.75} />
                      </Button>
                    </a>
                  ) : p.amount === 0 ? (
                    <Link to="/register" onClick={handleStartNavigation} className="w-full">
                      <Button className="w-full h-11 rounded-full font-medium" variant="outline" disabled={!freeRegActive}>
                        {freeRegActive ? "Empezar gratis" : "Registro cerrado"}
                        <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.75} />
                      </Button>
                    </Link>
                  ) : (
                    <Button className="w-full h-11 rounded-full font-medium" variant="outline" disabled>
                      Sin link de pago
                      <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.75} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {plans.length === 0 && (
              <div className="col-span-full text-center py-10 rounded-2xl border border-dashed border-border p-6">
                <p className="text-muted-foreground text-sm">No hay planes de pago disponibles configurados en este momento.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/50 bg-secondary/30">
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-20 md:py-28">
          <div className="mb-10">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Preguntas frecuentes</div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              Todo lo que quieres saber.
            </h2>
          </div>
          <Accordion type="single" collapsible className="w-full" data-testid="faq-accordion">
            {FAQ.map((f, idx) => (
              <AccordionItem key={idx} value={`item-${idx}`} className="border-border/60">
                <AccordionTrigger className="text-left text-base font-medium hover:no-underline" data-testid={`faq-trigger-${idx}`}>
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/50">
        <div className="max-w-4xl mx-auto px-5 md:px-8 py-20 md:py-28 text-center">
          <h2 className="font-display text-3xl md:text-5xl font-semibold tracking-tighter">
            ¿Qué decisión<br />necesitas tomar hoy?
          </h2>
          {!loading && user ? (
            <div className="mt-8">
              <Link to="/app">
                <Button size="lg" className="rounded-full h-12 px-8 text-base" data-testid="cta-register-btn">
                  Volver al Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.75} />
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
                Empieza gratis. Sin tarjeta. Sin complicaciones.
              </p>
              <div className="mt-8">
                <Link to="/register">
                  <Button size="lg" className="rounded-full h-12 px-8 text-base" data-testid="cta-register-btn">
                    Crear mi cuenta
                    <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.75} />
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      <footer className="border-t border-border/50">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <Logo />
          <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} STRATELIQ · Comité Ejecutivo Virtual</div>
        </div>
      </footer>
    </div>
  );
}
