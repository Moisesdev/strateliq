import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Search, Trash2, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

function formatDate(d) {
  const date = new Date(d);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  if (diffDays < 7) return date.toLocaleDateString("es", { weekday: "short" });
  return date.toLocaleDateString("es", { day: "2-digit", month: "short", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

export default function History() {
  const navigate = useNavigate();
  const [convos, setConvos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/conversations");
      setConvos(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return convos;
    const s = q.toLowerCase();
    return convos.filter((c) => c.title.toLowerCase().includes(s));
  }, [convos, q]);

  const remove = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar esta conversación?")) return;
    try {
      await api.delete(`/conversations/${id}`);
      setConvos((c) => c.filter((x) => x.conversation_id !== id));
      toast.success("Conversación eliminada");
    } catch (err) {
      toast.error("No pudimos eliminar");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Historial</div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Conversaciones</h1>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar consultas…"
          className="pl-9 h-11 rounded-lg"
          data-testid="history-search-input"
        />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center">
          <Clock className="h-5 w-5 text-muted-foreground mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            {q ? "Sin resultados" : "Aún no tienes conversaciones"}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card overflow-hidden" data-testid="history-list">
          {filtered.map((c) => (
            <li key={c.conversation_id}>
              <button
                onClick={() => navigate(`/app/chat/${c.conversation_id}`)}
                className="w-full flex items-center gap-4 px-4 py-3.5 md:px-5 md:py-4 text-left hover:bg-secondary/50 transition-colors"
                data-testid={`history-item-${c.conversation_id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm md:text-base font-medium truncate">{c.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{formatDate(c.updated_at)}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100"
                  onClick={(e) => remove(c.conversation_id, e)}
                  data-testid={`history-delete-${c.conversation_id}`}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                </Button>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
