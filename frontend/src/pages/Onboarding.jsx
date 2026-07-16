import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const QUESTIONS = [
  { key: "company_name", label: "¿Cuál es el nombre de tu empresa?", placeholder: "Ej. Café del Norte", type: "input" },
  { key: "what_you_sell", label: "¿Qué vendes?", placeholder: "Describe brevemente tu producto o servicio", type: "textarea" },
  { key: "ideal_customer", label: "¿Quién es tu cliente ideal?", placeholder: "Describe a tu cliente perfecto", type: "textarea" },
  { key: "main_problem", label: "¿Cuál es tu principal problema hoy?", placeholder: "El reto más grande que estás enfrentando", type: "textarea" },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ company_name: "", what_you_sell: "", ideal_customer: "", main_problem: "" });
  const [submitting, setSubmitting] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const q = QUESTIONS[step];
  const value = answers[q.key];
  const isLast = step === QUESTIONS.length - 1;

  const next = async () => {
    if (!value.trim()) {
      toast.error("Por favor completa esta respuesta");
      return;
    }
    if (isLast) {
      setSubmitting(true);
      try {
        await api.post("/onboarding", answers);
        await refresh();
        toast.success("¡Listo! Tu Comité está preparado.");
        navigate("/app", { replace: true });
      } catch (e) {
        toast.error("No pudimos guardar tus respuestas");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setStep((s) => s + 1);
  };

  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-5 md:px-8 h-16 border-b border-border/50">
        <Logo />
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground tabular-nums" data-testid="onboarding-progress">
            {step + 1} / {QUESTIONS.length}
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="h-0.5 bg-border">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
        />
      </div>

      <main className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-xl animate-fade-up" key={step}>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
            Paso {step + 1}
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight leading-tight mb-8">
            {q.label}
          </h1>
          {q.type === "input" ? (
            <Input
              autoFocus
              value={value}
              onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
              placeholder={q.placeholder}
              className="h-14 text-lg rounded-xl"
              data-testid={`onboarding-input-${q.key}`}
              onKeyDown={(e) => { if (e.key === "Enter") next(); }}
            />
          ) : (
            <Textarea
              autoFocus
              value={value}
              onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
              placeholder={q.placeholder}
              rows={4}
              className="text-base rounded-xl resize-none"
              data-testid={`onboarding-input-${q.key}`}
            />
          )}
          <div className="mt-8 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={back}
              disabled={step === 0}
              className="rounded-full"
              data-testid="onboarding-back-btn"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
              Atrás
            </Button>
            <Button
              onClick={next}
              disabled={submitting}
              className="rounded-full h-11 px-6"
              data-testid="onboarding-next-btn"
            >
              {submitting ? "Guardando…" : isLast ? "Finalizar" : "Siguiente"}
              {isLast ? (
                <Check className="ml-2 h-4 w-4" strokeWidth={1.75} />
              ) : (
                <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.75} />
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
