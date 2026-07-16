import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, TrendingUp, Target, DollarSign, Megaphone, LineChart, Scissors, Clock, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

const QUICK_ACTIONS = [
  { icon: LineChart, label: "Analizar mi negocio", prompt: "Analiza mi negocio actual: fortalezas, debilidades, oportunidades y riesgos. Dame un diagnóstico ejecutivo." },
  { icon: Target, label: "Crear estrategia", prompt: "Ayúdame a diseñar una estrategia de crecimiento para los próximos 90 días." },
  { icon: TrendingUp, label: "Mejorar ventas", prompt: "¿Cómo puedo aumentar mis ventas en los próximos 30 días?" },
  { icon: Scissors, label: "Reducir costos", prompt: "Sugiere formas concretas de reducir costos sin comprometer la calidad." },
  { icon: Megaphone, label: "Marketing", prompt: "Diseña una estrategia de marketing enfocada en captar más clientes ideales." },
  { icon: DollarSign, label: "Finanzas", prompt: "Analiza mi salud financiera y dame recomendaciones para mejorar la rentabilidad." },
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/conversations");
        setRecent(data.slice(0, 5));
      } catch (e) { /* ignore */ }
    })();
  }, []);

  const firstName = (user?.name || "").split(" ")[0] || "";

  const submit = (prompt) => {
    const text = prompt || question;
    if (!text.trim()) return;
    navigate("/app/chat", { state: { initialMessage: text.trim() } });
  };

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-10 md:py-16">
      {/* Greeting */}
      <div className="mb-10 md:mb-14">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Panel principal</div>
        <h1 className="font-display text-3xl md:text-5xl font-semibold tracking-tighter leading-tight">
          Hola{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="mt-3 text-lg md:text-xl text-muted-foreground">
          ¿Qué decisión necesitas tomar hoy?
        </p>
      </div>

      {/* Decision box */}
      <div className="mb-12">
        <div className="rounded-2xl border border-border/60 bg-card p-5 md:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background transition-shadow">
          <textarea
            data-testid="decision-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Escribe la decisión que quieres consultar con tu Comité…"
            rows={3}
            className="w-full resize-none bg-transparent text-lg md:text-xl leading-relaxed placeholder:text-muted-foreground outline-none border-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Enter para consultar · Shift+Enter salto de línea</div>
            <Button
              onClick={() => submit()}
              disabled={!question.trim()}
              className="rounded-full h-10 px-5"
              data-testid="decision-submit-btn"
            >
              Consultar al Comité
              <ArrowUpRight className="ml-1.5 h-4 w-4" strokeWidth={1.75} />
            </Button>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <section className="mb-14">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-muted-foreground mb-5">Acciones rápidas</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              onClick={() => submit(prompt)}
              data-testid={`quick-action-${label.toLowerCase().replace(/\s+/g, "-")}`}
              className="group text-left rounded-xl border border-border/60 bg-card p-4 md:p-5 hover:border-border transition-[transform,border-color] duration-200 hover:-translate-y-[1px]"
            >
              <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center mb-3 border border-border/60">
                <Icon className="h-[16px] w-[16px] text-primary" strokeWidth={1.5} />
              </div>
              <div className="font-medium text-sm md:text-base">{label}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-sm uppercase tracking-[0.2em] text-muted-foreground">Actividad reciente</h2>
          <button
            onClick={() => navigate("/app/history")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="see-all-history-btn"
          >
            Ver todo
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-transparent p-8 text-center">
            <MessageSquare className="h-5 w-5 text-muted-foreground mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">Aún no tienes consultas. Empieza haciendo tu primera decisión.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card overflow-hidden">
            {recent.map((c) => (
              <li key={c.conversation_id}>
                <button
                  onClick={() => navigate(`/app/chat/${c.conversation_id}`)}
                  className="w-full flex items-center gap-4 px-4 py-3 md:px-5 md:py-4 text-left hover:bg-secondary/50 transition-colors"
                  data-testid={`recent-conv-${c.conversation_id}`}
                >
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
                  <span className="flex-1 truncate text-sm md:text-base font-medium">{c.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
                    {new Date(c.updated_at).toLocaleDateString("es", { day: "2-digit", month: "short" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
