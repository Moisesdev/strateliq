import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shield, Check, Search, UserPlus, UserMinus, Trash2, KeyRound, LayoutList, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Navigate } from "react-router-dom";

const PROVIDERS = {
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-5", "gpt-5-mini", "gpt-4o", "o4-mini"],
  anthropic: ["claude-sonnet-4-6", "claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001", "claude-opus-4-7"],
  gemini: ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-pro"],
  openrouter: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "meta-llama/llama-3.1-70b-instruct", "google/gemini-2.0-flash-exp:free"],
  custom: [],
};

const PROVIDER_LABELS = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  custom: "Custom (OpenAI-compatible)",
};

// ---------- Model tab ----------
function ModelTab() {
  const [config, setConfig] = useState({ provider: "openai", model: "gpt-4.1-mini" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customModel, setCustomModel] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/admin/config");
        setConfig(data);
      } catch (e) { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

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
    } finally { setSaving(false); }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  const providerModels = PROVIDERS[config.provider] || [];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 md:p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Shield className="h-4 w-4 text-primary" strokeWidth={1.5} />
        Configuración global del Comité (aplica a todos los usuarios)
      </div>

      <div className="space-y-2">
        <Label>Proveedor</Label>
        <Select
          value={config.provider}
          onValueChange={(v) => setConfig({ provider: v, model: (PROVIDERS[v] || [])[0] || "" })}
        >
          <SelectTrigger className="h-11 rounded-lg" data-testid="admin-provider-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(PROVIDER_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {providerModels.length > 0 && (
        <div className="space-y-2">
          <Label>Modelo</Label>
          <Select value={config.model} onValueChange={(v) => setConfig({ ...config, model: v })}>
            <SelectTrigger className="h-11 rounded-lg" data-testid="admin-model-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {providerModels.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              {!providerModels.includes(config.model) && config.model && (
                <SelectItem value={config.model}>{config.model} (personalizado)</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label>Modelo personalizado {config.provider === "custom" ? "(requerido)" : "(opcional)"}</Label>
        <Input
          value={customModel}
          onChange={(e) => setCustomModel(e.target.value)}
          placeholder={config.provider === "custom" ? "p.ej. gpt-4o-mini" : "sobreescribe la selección anterior"}
          className="h-11 rounded-lg"
          data-testid="admin-custom-model-input"
        />
        <p className="text-xs text-muted-foreground">
          {config.provider === "custom"
            ? "Configura la URL base y la API key en la pestaña API Keys."
            : "Si se llena, sobreescribe el modelo seleccionado."}
        </p>
      </div>

      <div className="pt-2 flex justify-end">
        <Button onClick={save} disabled={saving} className="rounded-full h-10 px-5" data-testid="admin-save-btn">
          {saving ? "Guardando…" : (<><Check className="h-4 w-4 mr-1.5" strokeWidth={1.5} />Guardar</>)}
        </Button>
      </div>
    </div>
  );
}

// ---------- Users tab ----------
function UsersTab({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = async (search) => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/users", { params: search ? { q: search } : {} });
      setUsers(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const toggleAdmin = async (u) => {
    try {
      const { data } = await api.put(`/admin/users/${u.user_id}`, { is_admin: !u.is_admin });
      setUsers((list) => list.map((x) => x.user_id === u.user_id ? { ...x, ...data } : x));
      toast.success(data.is_admin ? "Ahora es admin" : "Permisos removidos");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos actualizar");
    }
  };

  const removeUser = async () => {
    if (!confirmDel) return;
    try {
      await api.delete(`/admin/users/${confirmDel.user_id}`);
      setUsers((list) => list.filter((u) => u.user_id !== confirmDel.user_id));
      toast.success("Usuario eliminado");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos eliminar");
    } finally { setConfirmDel(null); }
  };

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por email o nombre…"
          className="pl-9 h-11 rounded-lg"
          data-testid="admin-users-search"
        />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          Sin resultados
        </div>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card overflow-hidden" data-testid="admin-users-list">
          {users.map((u) => (
            <li key={u.user_id} className="flex items-center gap-4 px-4 py-3.5 md:px-5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  {u.name}
                  {u.is_admin && (
                    <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px]">Admin</Badge>
                  )}
                  {u.user_id === currentUserId && (
                    <Badge variant="outline" className="text-[10px]">Tú</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{u.email}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-xs"
                onClick={() => toggleAdmin(u)}
                disabled={u.user_id === currentUserId && u.is_admin}
                data-testid={`admin-toggle-${u.user_id}`}
              >
                {u.is_admin ? (<><UserMinus className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} /> Quitar admin</>) : (<><UserPlus className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} /> Hacer admin</>)}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-destructive hover:text-destructive"
                onClick={() => setConfirmDel(u)}
                disabled={u.user_id === currentUserId}
                data-testid={`admin-delete-${u.user_id}`}
                aria-label="Eliminar usuario"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent data-testid="confirm-delete-dialog">
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
            <DialogDescription>
              Esta acción elimina permanentemente a {confirmDel?.email} y todos sus datos (empresa, conversaciones, suscripción). No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={removeUser} data-testid="confirm-delete-btn">Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Plans tab ----------
function PlansTab() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/plans");
      setPlans(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const update = (id, field, value) => {
    setPlans((list) => list.map((p) => p.plan_id === id ? { ...p, [field]: value } : p));
  };

  const save = async (plan) => {
    setSaving(plan.plan_id);
    try {
      const payload = {
        name: plan.name,
        amount: parseFloat(plan.amount) || 0,
        currency: plan.currency || "usd",
        period_days: parseInt(plan.period_days) || 30,
        stripe_payment_link: plan.stripe_payment_link || null,
        features: Array.isArray(plan.features)
          ? plan.features
          : (plan.features || "").split("\n").map((s) => s.trim()).filter(Boolean),
      };
      await api.put(`/admin/plans/${plan.plan_id}`, payload);
      await load();
      toast.success(`Plan ${plan.name} actualizado`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos guardar");
    } finally { setSaving(null); }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-5">
      {plans.map((p) => (
        <div key={p.plan_id} className="rounded-xl border border-border/60 bg-card p-5 md:p-6 space-y-4" data-testid={`admin-plan-${p.plan_id}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">ID: {p.plan_id}</div>
              <h3 className="font-display text-lg font-semibold">{p.name}</h3>
            </div>
            <Button onClick={() => save(p)} disabled={saving === p.plan_id} size="sm" className="rounded-full" data-testid={`admin-save-plan-${p.plan_id}`}>
              {saving === p.plan_id ? "Guardando…" : "Guardar"}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={p.name} onChange={(e) => update(p.plan_id, "name", e.target.value)} className="h-10 rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Precio</Label>
              <Input type="number" step="0.01" value={p.amount} onChange={(e) => update(p.plan_id, "amount", e.target.value)} className="h-10 rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Input value={p.currency} onChange={(e) => update(p.plan_id, "currency", e.target.value.toLowerCase())} className="h-10 rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Días</Label>
              <Input type="number" value={p.period_days} onChange={(e) => update(p.plan_id, "period_days", e.target.value)} className="h-10 rounded-lg" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Enlace de pago (Stripe Payment Link opcional)</Label>
            <Input
              value={p.stripe_payment_link || ""}
              onChange={(e) => update(p.plan_id, "stripe_payment_link", e.target.value)}
              placeholder="https://buy.stripe.com/..."
              className="h-10 rounded-lg"
              data-testid={`admin-plan-link-${p.plan_id}`}
            />
            <p className="text-xs text-muted-foreground">Si se llena, el botón &ldquo;Elegir plan&rdquo; redirige directamente a este enlace en lugar de crear un Checkout dinámico.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Características (una por línea)</Label>
            <Textarea
              value={Array.isArray(p.features) ? p.features.join("\n") : (p.features || "")}
              onChange={(e) => update(p.plan_id, "features", e.target.value)}
              rows={3}
              className="rounded-lg resize-none"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- API Keys tab ----------
function ApiKeysTab() {
  const [state, setState] = useState({
    openai_key_masked: "", openrouter_key_masked: "", custom_key_masked: "", custom_base_url: "",
    has_openai: false, has_openrouter: false, has_custom: false,
  });
  const [openaiKey, setOpenaiKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/api-keys");
      setState(data);
      setCustomBaseUrl(data.custom_base_url || "");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { custom_base_url: customBaseUrl };
      if (openaiKey) payload.openai_key = openaiKey;
      if (openrouterKey) payload.openrouter_key = openrouterKey;
      if (customKey) payload.custom_key = customKey;
      const { data } = await api.put("/admin/api-keys", payload);
      setState(data);
      setOpenaiKey(""); setOpenrouterKey(""); setCustomKey("");
      toast.success("API keys actualizadas");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos guardar");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/60 bg-card p-5 md:p-6 space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <KeyRound className="h-4 w-4 text-primary" strokeWidth={1.5} />
          Las claves se almacenan cifradas y se prefieren sobre las del entorno.
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>OpenAI</Label>
            {state.has_openai && (
              <Badge variant="outline" className="border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] text-[10px]">
                {state.openai_key_masked}
              </Badge>
            )}
          </div>
          <Input
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder={state.has_openai ? "Dejar vacío para conservar la actual" : "sk-..."}
            className="h-11 rounded-lg"
            data-testid="admin-key-openai"
          />
          <p className="text-xs text-muted-foreground">Si se deja vacío, se usa la Emergent Universal Key.</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>OpenRouter</Label>
            {state.has_openrouter && (
              <Badge variant="outline" className="border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] text-[10px]">
                {state.openrouter_key_masked}
              </Badge>
            )}
          </div>
          <Input
            type="password"
            value={openrouterKey}
            onChange={(e) => setOpenrouterKey(e.target.value)}
            placeholder={state.has_openrouter ? "Dejar vacío para conservar la actual" : "sk-or-v1-..."}
            className="h-11 rounded-lg"
            data-testid="admin-key-openrouter"
          />
        </div>

        <div className="pt-4 border-t border-border/60 space-y-4">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Proveedor personalizado (compatible OpenAI)</div>
          <div className="space-y-2">
            <Label>URL base</Label>
            <Input
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
              placeholder="https://api.together.xyz/v1"
              className="h-11 rounded-lg"
              data-testid="admin-key-custom-url"
            />
            <p className="text-xs text-muted-foreground">Endpoint que expone /chat/completions estilo OpenAI (Together, Fireworks, Groq, Ollama, etc.).</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>API Key</Label>
              {state.has_custom && (
                <Badge variant="outline" className="border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] text-[10px]">
                  {state.custom_key_masked}
                </Badge>
              )}
            </div>
            <Input
              type="password"
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              placeholder={state.has_custom ? "Dejar vacío para conservar la actual" : "clave del proveedor"}
              className="h-11 rounded-lg"
              data-testid="admin-key-custom-key"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="rounded-full h-10 px-5" data-testid="admin-keys-save-btn">
            {saving ? "Guardando…" : (<><Check className="h-4 w-4 mr-1.5" strokeWidth={1.5} />Guardar</>)}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  if (user && !user.is_admin) return <Navigate to="/app" replace />;
  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Panel de administración</div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Administración</h1>
        <p className="mt-3 text-muted-foreground">Configura el Comité, gestiona usuarios, planes y claves de API.</p>
      </div>

      <Tabs defaultValue="model" className="w-full">
        <TabsList className="grid grid-cols-4 w-full md:w-auto md:inline-flex mb-6" data-testid="admin-tabs">
          <TabsTrigger value="model" data-testid="tab-model" className="gap-1.5"><Shield className="h-3.5 w-3.5" strokeWidth={1.5} />Modelo</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users" className="gap-1.5"><Users className="h-3.5 w-3.5" strokeWidth={1.5} />Usuarios</TabsTrigger>
          <TabsTrigger value="plans" data-testid="tab-plans" className="gap-1.5"><LayoutList className="h-3.5 w-3.5" strokeWidth={1.5} />Planes</TabsTrigger>
          <TabsTrigger value="keys" data-testid="tab-keys" className="gap-1.5"><KeyRound className="h-3.5 w-3.5" strokeWidth={1.5} />API Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="model"><ModelTab /></TabsContent>
        <TabsContent value="users"><UsersTab currentUserId={user.user_id} /></TabsContent>
        <TabsContent value="plans"><PlansTab /></TabsContent>
        <TabsContent value="keys"><ApiKeysTab /></TabsContent>
      </Tabs>
    </div>
  );
}
