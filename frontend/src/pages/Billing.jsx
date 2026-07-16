import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, Sparkles, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const PLAN_FEATURES = {
  inicial: ["Consultas ilimitadas", "Export PDF", "Compartir conversaciones"],
  pro: ["Todo lo del plan Inicial", "Análisis multidisciplinario profundo", "Soporte prioritario"],
  max: ["Todo lo del plan Pro", "Configuración de modelo IA avanzado", "Estrategia trimestral acompañada"],
};

const PLAN_ACCENT = {
  inicial: "border-border/60",
  pro: "border-primary/70 ring-1 ring-primary/20",
  max: "border-border/60",
};

function Plan({ id, name, amount, currency, current, onSelect, loading, highlight }) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-6 md:p-7 flex flex-col",
        PLAN_ACCENT[id],
      )}
      data-testid={`plan-card-${id}`}
    >
      <div className="flex items-baseline justify-between mb-4">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{name}</div>
        {highlight && (
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px]">Recomendado</Badge>
        )}
      </div>
      <div className="mb-6">
        <span className="font-display text-4xl md:text-5xl font-semibold tracking-tighter">${amount}</span>
        <span className="text-sm text-muted-foreground ml-1">/mes {currency.toUpperCase()}</span>
      </div>
      <ul className="space-y-2.5 mb-8 flex-1">
        {PLAN_FEATURES[id].map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <Check className="h-4 w-4 text-[hsl(var(--success))] mt-0.5 shrink-0" strokeWidth={1.75} />
            <span className="text-foreground/85">{f}</span>
          </li>
        ))}
      </ul>
      <Button
        onClick={() => onSelect(id)}
        disabled={current || loading}
        className={cn("rounded-full h-11 w-full", current && "cursor-default")}
        variant={id === "pro" ? "default" : "outline"}
        data-testid={`plan-select-${id}`}
      >
        {current ? "Plan actual" : loading ? "Redirigiendo…" : "Elegir plan"}
      </Button>
    </div>
  );
}

export default function Billing() {
  const [plans, setPlans] = useState([]);
  const [sub, setSub] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [pollStatus, setPollStatus] = useState(null);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const polledRef = useRef(false);

  const loadState = async () => {
    const [{ data: p }, { data: s }] = await Promise.all([
      api.get("/plans"),
      api.get("/subscription"),
    ]);
    setPlans(p);
    setSub(s);
  };

  useEffect(() => { loadState(); }, []);

  // Handle return from Stripe
  useEffect(() => {
    const sessionId = params.get("session_id");
    const canceled = params.get("canceled");
    if (canceled) {
      toast.info("Pago cancelado");
      setParams({}, { replace: true });
      return;
    }
    if (!sessionId || polledRef.current) return;
    polledRef.current = true;
    setPollStatus("pending");

    const poll = async (attempt = 0) => {
      if (attempt >= 8) {
        setPollStatus("timeout");
        toast.error("Verificación de pago tardó demasiado. Recarga esta página.");
        return;
      }
      try {
        const { data } = await api.get(`/checkout/status/${sessionId}`);
        if (data.payment_status === "paid") {
          setPollStatus("paid");
          toast.success("¡Pago exitoso! Tu plan está activo.");
          await loadState();
          setParams({}, { replace: true });
          return;
        }
        if (data.status === "expired") {
          setPollStatus("expired");
          toast.error("La sesión de pago expiró.");
          return;
        }
        setTimeout(() => poll(attempt + 1), 2000);
      } catch (e) {
        setTimeout(() => poll(attempt + 1), 2000);
      }
    };
    poll();
  }, []);

  const selectPlan = async (planId) => {
    setCheckoutLoading(true);
    try {
      const { data } = await api.post("/checkout/session", {
        plan_id: planId,
        origin_url: window.location.origin,
      });
      window.location.href = data.url;
    } catch (e) {
      toast.error("No pudimos iniciar el pago");
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-10">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Facturación</div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Elige tu plan</h1>
        <p className="mt-3 text-muted-foreground">Todos los planes incluyen consultas ilimitadas al Comité Ejecutivo.</p>
      </div>

      {sub && sub.status === "active" && (
        <div className="mb-8 rounded-xl border border-[hsl(var(--success))]/25 bg-[hsl(var(--success))]/5 p-4 flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-[hsl(var(--success))]" strokeWidth={1.75} />
          <div className="text-sm">
            Tu plan actual es <span className="font-semibold">{sub.plan_name}</span>
            {sub.expires_at && (
              <> · renueva el {new Date(sub.expires_at).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}</>
            )}
          </div>
        </div>
      )}

      {pollStatus === "pending" && (
        <div className="mb-8 rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3 text-sm">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Verificando tu pago…
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {plans.map((p) => (
          <Plan
            key={p.id}
            id={p.id}
            name={p.name}
            amount={p.amount}
            currency={p.currency}
            current={sub?.plan_id === p.id && sub?.status === "active"}
            onSelect={selectPlan}
            loading={checkoutLoading}
            highlight={p.id === "pro"}
          />
        ))}
      </div>

      <div className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
        <CreditCard className="h-3.5 w-3.5" strokeWidth={1.5} />
        Pago seguro con Stripe · cancela cuando quieras
      </div>
    </div>
  );
}
