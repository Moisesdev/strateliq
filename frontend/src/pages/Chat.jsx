import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, API } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Parse assistant text into structured sections
function parseAssistant(text) {
  if (!text) return { tags: [], analysis: "", conclusion: "", actions: [], intro: "" };
  const introMatch = text.match(/^([\s\S]*?)\[TAGS:/);
  const intro = introMatch ? introMatch[1].trim() : "";
  const tagsMatch = text.match(/\[TAGS:\s*([^\]]+)\]/i);
  const tags = tagsMatch ? tagsMatch[1].split(",").map((t) => t.trim()).filter(Boolean) : [];

  const anMatch = text.match(/##\s*An[aá]lisis\s*\n([\s\S]*?)(?=##\s*Conclusi[oó]n\s+Estrat[eé]gica|$)/i);
  const analysis = anMatch ? anMatch[1].trim() : "";

  const conMatch = text.match(/##\s*Conclusi[oó]n\s+Estrat[eé]gica\s*\n([\s\S]*?)(?=##\s*Acciones\s+Recomendadas|$)/i);
  const conclusion = conMatch ? conMatch[1].trim() : "";

  const actMatch = text.match(/##\s*Acciones\s+Recomendadas\s*\n([\s\S]*?)$/i);
  let actions = [];
  if (actMatch) {
    actions = actMatch[1]
      .split(/\n/)
      .map((l) => l.replace(/^\s*(?:\d+[\.\)]|[-*])\s*/, "").trim())
      .filter(Boolean);
  }
  return { tags, analysis, conclusion, actions, intro };
}

const TAG_STYLES = {
  Marketing: "bg-primary/10 text-primary border-primary/20",
  Finanzas: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/25",
  Ventas: "bg-secondary text-foreground border-border",
  Operaciones: "bg-muted text-foreground border-border",
};

function AssistantMessage({ text, streaming }) {
  const parsed = parseAssistant(text);
  const showStructured = parsed.tags.length > 0 || parsed.analysis || parsed.conclusion || parsed.actions.length > 0;
  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
        Comité Estratégico
      </div>
      <div className="text-[15px] md:text-base leading-relaxed text-foreground mb-4 font-medium">
        El Comité Estratégico analizó tu consulta.
      </div>

      {showStructured ? (
        <>
          {parsed.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5" data-testid="assistant-tags">
              {parsed.tags.map((t) => (
                <Badge key={t} variant="outline" className={cn("rounded-full font-medium border", TAG_STYLES[t] || "bg-secondary text-foreground border-border")}>
                  {t}
                </Badge>
              ))}
            </div>
          )}
          {parsed.analysis && (
            <div className="mb-6">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Análisis</div>
              <div className="text-[15px] md:text-base leading-relaxed whitespace-pre-wrap text-foreground/90">
                {parsed.analysis}
              </div>
            </div>
          )}
          {parsed.conclusion && (
            <div className="mb-6 rounded-xl border border-border/60 bg-secondary/50 p-4 md:p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Conclusión estratégica</div>
              <div className="text-[15px] md:text-base leading-relaxed text-foreground">
                {parsed.conclusion}
              </div>
            </div>
          )}
          {parsed.actions.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Acciones recomendadas</div>
              <ol className="space-y-2.5">
                {parsed.actions.map((a, i) => (
                  <li key={i} className="flex gap-3 text-[15px] md:text-base leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span className="text-foreground/90">{a}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      ) : (
        <div className="text-[15px] md:text-base leading-relaxed whitespace-pre-wrap text-foreground/90">
          {text}
          {streaming && <span className="inline-block ml-1 h-3 w-1.5 bg-primary animate-pulse align-middle" />}
        </div>
      )}
      {streaming && showStructured && (
        <div className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Analizando…
        </div>
      )}
    </div>
  );
}

function UserMessage({ text }) {
  return (
    <div className="flex justify-end animate-fade-up">
      <div className="max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-4 py-3 text-[15px] md:text-base leading-relaxed">
        {text}
      </div>
    </div>
  );
}

export default function Chat() {
  const { conversationId: routeConvId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState(routeConvId || null);
  const scrollRef = useRef(null);
  const initialTriggered = useRef(false);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 30);
  };

  // Load history when conversationId comes from URL
  useEffect(() => {
    if (!routeConvId) {
      setMessages([]);
      setConversationId(null);
      return;
    }
    (async () => {
      try {
        const { data } = await api.get(`/conversations/${routeConvId}`);
        setConversationId(routeConvId);
        setMessages(data.messages.map((m) => ({ role: m.role, content: m.content })));
        scrollToBottom();
      } catch (e) {
        toast.error("No pudimos cargar la conversación");
        navigate("/app/chat", { replace: true });
      }
    })();
  }, [routeConvId, navigate]);

  // Initial message from Dashboard navigation
  useEffect(() => {
    const initial = location.state?.initialMessage;
    if (initial && !initialTriggered.current) {
      initialTriggered.current = true;
      window.history.replaceState({}, "");
      send(initial);
    }
  }, [location.state]);

  const send = async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    scrollToBottom();
    setStreaming(true);

    try {
      const token = localStorage.getItem("strateliq-token");
      const res = await fetch(`${API}/chat/stream`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, conversation_id: conversationId }),
      });

      if (!res.ok || !res.body) {
        throw new Error("stream failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "message";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const lines = chunk.split("\n");
          let dataStr = "";
          currentEvent = "message";
          for (const l of lines) {
            if (l.startsWith("event:")) currentEvent = l.slice(6).trim();
            else if (l.startsWith("data:")) dataStr += l.slice(5).replace(/^ /, "");
          }

          if (currentEvent === "meta") {
            try {
              const meta = JSON.parse(dataStr);
              if (meta.conversation_id) {
                setConversationId(meta.conversation_id);
                if (!routeConvId) {
                  window.history.replaceState({}, "", `/app/chat/${meta.conversation_id}`);
                }
              }
            } catch (e) { /* ignore malformed meta */ }
          } else if (currentEvent === "error") {
            toast.error("Hubo un error del Comité");
          } else if (currentEvent === "done") {
            // no-op
          } else {
            const delta = dataStr
              .replace(/\\n/g, "\n")
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, "\\");
            setMessages((prev) => {
              const copy = [...prev];
              if (copy.length === 0 || copy[copy.length - 1].role !== "assistant") {
                copy.push({ role: "assistant", content: delta });
              } else {
                copy[copy.length - 1] = { role: "assistant", content: (copy[copy.length - 1].content || "") + delta };
              }
              return copy;
            });
            scrollToBottom();
          }
        }
      }
    } catch (e) {
      toast.error("Conexión interrumpida con el Comité");
    } finally {
      setStreaming(false);
      scrollToBottom();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen">
      {/* Header */}
      <div className="border-b border-border/50 px-5 md:px-10 py-4 md:py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Comité Ejecutivo</div>
            <h1 className="font-display text-lg md:text-xl font-semibold">Consultoría estratégica</h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-xs md:text-sm"
            onClick={() => { navigate("/app/chat"); setMessages([]); setConversationId(null); initialTriggered.current = false; }}
            data-testid="new-chat-btn"
          >
            Nueva consulta
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 md:px-10 py-8 md:py-10 space-y-8">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-secondary mb-5">
                <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.5} />
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-2">
                ¿Qué decisión necesitas tomar hoy?
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Tu Comité Ejecutivo Virtual analizará tu consulta desde marketing, finanzas, ventas y operaciones.
              </p>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserMessage key={i} text={m.content} />
            ) : (
              <AssistantMessage key={i} text={m.content} streaming={streaming && i === messages.length - 1} />
            )
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border/50 px-5 md:px-10 py-4 md:py-5 glass">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-2xl border border-border/60 bg-card p-3 md:p-4 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background transition-shadow">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Escribe tu consulta al Comité…"
              className="w-full resize-none bg-transparent outline-none border-0 text-[15px] md:text-base leading-relaxed placeholder:text-muted-foreground max-h-40"
              data-testid="chat-input"
              disabled={streaming}
            />
            <div className="mt-2 flex items-center justify-between">
              <div className="text-[11px] text-muted-foreground">Enter para enviar</div>
              <Button
                size="sm"
                onClick={() => send()}
                disabled={!input.trim() || streaming}
                className="rounded-full h-9 px-4"
                data-testid="chat-send-btn"
              >
                {streaming ? "Analizando…" : "Consultar"}
                {!streaming && <ArrowUpRight className="ml-1 h-4 w-4" strokeWidth={1.75} />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
