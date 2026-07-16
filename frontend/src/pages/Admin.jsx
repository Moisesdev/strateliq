import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shield, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Navigate } from "react-router-dom";

const PROVIDERS = {
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-5", "gpt-5-mini", "gpt-4o", "o4-mini"],
  anthropic: ["claude-sonnet-4-6", "claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001", "claude-opus-4-7"],
  gemini: ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-pro"],
  openrouter: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "meta-llama/llama-3.1-70b-instruct", "google/gemini-2.0-flash-exp:free"],
};

export default function Admin() {
  const { user } = useAuth();
  const [config, setConfig] = useState({ provider: "openai", model: "gpt-4.1-mini" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customModel, setCustomModel] = useState("");

  useEffect(() => {
    if (!user?.is_admin) return;
    (async () => {
      try {
        const { data } = await api.get("/admin/config");
        setConfig(data);
      } catch (e) {
        toast.error("No pudimos cargar la configuración");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (user && !user.is_admin) return <Navigate to="/app" replace />;

  const save = async () => {
    setSaving(true);
    try {
      const finalModel = customModel.trim() || config.model;
      const { data } = await api.put("/admin/config", { provider: config.provider, model: finalModel });
      setConfig(data);
      setCustomModel("");
      toast.success("Configuración actualizada");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Panel de administración</div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Modelo del Comité</h1>
        <p className="mt-3 text-muted-foreground">Elige el proveedor y modelo que ejecutará las consultas estratégicas.</p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card p-5 md:p-6 space-y-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-primary" strokeWidth={1.5} />
            Configuración global (aplica a todos los usuarios)
          </div>

          <div className="space-y-2">
            <Label>Proveedor</Label>
            <Select value={config.provider} onValueChange={(v) => setConfig({ provider: v, model: PROVIDERS[v][0] })}>
              <SelectTrigger className="h-11 rounded-lg" data-testid="admin-provider-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="gemini">Google Gemini</SelectItem>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Modelo</Label>
            <Select value={config.model} onValueChange={(v) => setConfig({ ...config, model: v })}>
              <SelectTrigger className="h-11 rounded-lg" data-testid="admin-model-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS[config.provider].map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
                {!PROVIDERS[config.provider].includes(config.model) && (
                  <SelectItem value={config.model}>{config.model} (personalizado)</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Modelo personalizado (opcional)</Label>
            <Input
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="p.ej. gpt-5.2 o claude-opus-4-8"
              className="h-11 rounded-lg"
              data-testid="admin-custom-model-input"
            />
            <p className="text-xs text-muted-foreground">Si se llena este campo, sobreescribe la selección anterior.</p>
          </div>

          <div className="pt-2 flex justify-end">
            <Button onClick={save} disabled={saving} className="rounded-full h-10 px-5" data-testid="admin-save-btn">
              {saving ? "Guardando…" : (<><Check className="h-4 w-4 mr-1.5" strokeWidth={1.5} />Guardar</>)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
