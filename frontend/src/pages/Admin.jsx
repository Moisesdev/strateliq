import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Shield, Check, Search, UserPlus, UserMinus, Trash2, KeyRound, LayoutList, Users, Palette, Upload, Image, Info, CreditCard, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useBranding } from "@/context/BrandingContext";
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
  const [systemPrompt, setSystemPrompt] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/admin/config");
        setConfig(data);
        setSystemPrompt(data.system_prompt || "");
      } catch (e) { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const finalModel = customModel.trim() || config.model;
      const { data } = await api.put("/admin/config", {
        provider: config.provider,
        model: finalModel,
        system_prompt: systemPrompt
      });
      setConfig(data);
      setSystemPrompt(data.system_prompt || "");
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

      <div className="space-y-2 pt-2 border-t border-border/40">
        <Label className="text-sm font-semibold">System Prompt</Label>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Escribe el system prompt personalizado aquí..."
          className="min-h-[280px] font-sans text-sm rounded-lg border-border/60 focus:ring-2 focus:ring-primary focus:ring-offset-2 p-3 bg-background"
          data-testid="admin-system-prompt-textarea"
        />
        <p className="text-xs text-muted-foreground">
          Define el rol, tono y comportamiento que asumirá la IA en el chat.
        </p>
      </div>

      <div className="rounded-xl border border-border/40 bg-background/50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          <Info className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
          Variables de Contexto Disponibles
        </div>
        <p className="text-xs text-muted-foreground">
          Estas variables se inyectarán de forma dinámica en tu prompt según el negocio del usuario actual. Envuélvelas entre llaves <span className="font-mono">{`{...}`}</span> para usarlas:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
          <div className="text-xs p-2.5 rounded-lg border border-border/30 bg-card">
            <span className="font-mono font-semibold text-primary">{`{company_name}`}</span>
            <p className="text-muted-foreground mt-0.5 text-[11px]">Nombre de la empresa.</p>
          </div>
          <div className="text-xs p-2.5 rounded-lg border border-border/30 bg-card">
            <span className="font-mono font-semibold text-primary">{`{what_you_sell}`}</span>
            <p className="text-muted-foreground mt-0.5 text-[11px]">Qué vende / productos.</p>
          </div>
          <div className="text-xs p-2.5 rounded-lg border border-border/30 bg-card">
            <span className="font-mono font-semibold text-primary">{`{ideal_customer}`}</span>
            <p className="text-muted-foreground mt-0.5 text-[11px]">Cliente ideal / clientes.</p>
          </div>
          <div className="text-xs p-2.5 rounded-lg border border-border/30 bg-card">
            <span className="font-mono font-semibold text-primary">{`{main_problem}`}</span>
            <p className="text-muted-foreground mt-0.5 text-[11px]">Problema principal actual.</p>
          </div>
          <div className="text-xs p-2.5 rounded-lg border border-border/30 bg-card">
            <span className="font-mono font-semibold text-primary">{`{objectives}`}</span>
            <p className="text-muted-foreground mt-0.5 text-[11px]">Objetivos de la empresa.</p>
          </div>
          <div className="text-xs p-2.5 rounded-lg border border-border/30 bg-card">
            <span className="font-mono font-semibold text-primary">{`{products}`}</span>
            <p className="text-muted-foreground mt-0.5 text-[11px]">Detalle de productos.</p>
          </div>
          <div className="text-xs p-2.5 rounded-lg border border-border/30 bg-card">
            <span className="font-mono font-semibold text-primary">{`{customers}`}</span>
            <p className="text-muted-foreground mt-0.5 text-[11px]">Detalle de clientes.</p>
          </div>
          <div className="text-xs p-2.5 rounded-lg border border-border/30 bg-card">
            <span className="font-mono font-semibold text-primary">{`{competitors}`}</span>
            <p className="text-muted-foreground mt-0.5 text-[11px]">Competidores directos.</p>
          </div>
          <div className="text-xs p-2.5 rounded-lg border border-border/30 bg-card">
            <span className="font-mono font-semibold text-primary">{`{market}`}</span>
            <p className="text-muted-foreground mt-0.5 text-[11px]">Mercado e industria.</p>
          </div>
        </div>
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
  const [plans, setPlans] = useState([]);
  
  // Modal State
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmAdminText, setConfirmAdminText] = useState("");
  const [confirmDeleteText, setConfirmDeleteText] = useState("");
  
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [updatingPass, setUpdatingPass] = useState(false);

  const load = async (search) => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/users", { params: search ? { q: search } : {} });
      setUsers(data);
    } finally { setLoading(false); }
  };

  const loadPlans = async () => {
    try {
      const { data } = await api.get("/admin/plans");
      setPlans(data);
    } catch (e) {
      console.error("No pudimos cargar los planes", e);
    }
  };

  useEffect(() => {
    load();
    loadPlans();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const handleToggleAdmin = async (u) => {
    try {
      const { data } = await api.put(`/admin/users/${u.user_id}`, { is_admin: !u.is_admin });
      setUsers((list) => list.map((x) => x.user_id === u.user_id ? { ...x, ...data } : x));
      toast.success(data.is_admin ? "Ahora es admin" : "Permisos removidos");
      setSelectedUser((curr) => curr && curr.user_id === u.user_id ? { ...curr, ...data } : curr);
      setConfirmAdminText("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos actualizar permisos");
    }
  };

  const handleSavePlan = async () => {
    if (!selectedUser) return;
    setUpdatingPlan(true);
    try {
      const { data } = await api.put(`/admin/users/${selectedUser.user_id}/plan`, { plan_id: selectedPlan });
      setUsers((list) => list.map((x) => x.user_id === selectedUser.user_id ? { ...x, plan: data.plan } : x));
      setSelectedUser((curr) => curr ? { ...curr, plan: data.plan } : null);
      toast.success("Plan actualizado con éxito");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos actualizar el plan");
    } finally { setUpdatingPlan(false); }
  };

  const handleSavePassword = async () => {
    if (!selectedUser || newPassword.length < 6) return;
    setUpdatingPass(true);
    try {
      await api.put(`/admin/users/${selectedUser.user_id}/password`, { password: newPassword });
      toast.success("Contraseña actualizada con éxito");
      setNewPassword("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos cambiar la contraseña");
    } finally { setUpdatingPass(false); }
  };

  const handleRemoveUser = async (u) => {
    try {
      await api.delete(`/admin/users/${u.user_id}`);
      setUsers((list) => list.filter((x) => x.user_id !== u.user_id));
      toast.success("Usuario eliminado permanentemente");
      setSelectedUser(null);
      setConfirmDeleteText("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos eliminar al usuario");
    }
  };

  const openSettings = (u) => {
    setSelectedUser(u);
    setSelectedPlan(u.plan || "gratuito");
    setNewPassword("");
    setConfirmAdminText("");
    setConfirmDeleteText("");
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
            <li key={u.user_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-4 md:px-5">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-sm font-medium truncate flex items-center flex-wrap gap-2">
                  {u.name}
                  {u.is_admin && (
                    <Badge variant="outline" className="border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] text-[10px]">Admin</Badge>
                  )}
                  {u.user_id === currentUserId && (
                    <Badge variant="outline" className="text-[10px]">Tú</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] uppercase border-border/60">
                    Plan: {u.plan}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                {u.created_at && (
                  <div className="text-[10px] text-muted-foreground/85">
                    Registrado el: {new Date(u.created_at).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 self-end sm:self-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full hover:bg-secondary"
                  onClick={() => openSettings(u)}
                  data-testid={`admin-settings-${u.user_id}`}
                  aria-label="Configurar usuario"
                >
                  <Settings className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Modal de Configuración de Usuario */}
      <Dialog open={!!selectedUser} onOpenChange={(o) => !o && setSelectedUser(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto no-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold font-display">Ajustes de Usuario</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Gestiona los detalles, permisos, planes y accesos de <span className="font-semibold text-foreground">{selectedUser?.name}</span> ({selectedUser?.email}).
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-6 py-4 divide-y divide-border/60">
              
              {/* Sección 1: Plan de Suscripción */}
              <div className="space-y-3 pt-0">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan de Suscripción</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                      <SelectTrigger className="h-10 rounded-md text-xs">
                        <SelectValue placeholder="Seleccionar plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gratuito">Gratuito (Sin plan activo)</SelectItem>
                        {plans.map((p) => (
                          <SelectItem key={p.plan_id} value={p.plan_id} className="text-xs">
                            {p.name} (${p.amount} / {p.period_days} días)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleSavePlan}
                    disabled={updatingPlan || selectedPlan === selectedUser.plan}
                    className="h-10 text-xs px-4"
                  >
                    {updatingPlan ? "Guardando…" : "Actualizar"}
                  </Button>
                </div>
              </div>

              {/* Sección 2: Cambiar Contraseña */}
              <div className="space-y-3 pt-5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cambiar Contraseña</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="h-10 text-xs rounded-md flex-1"
                  />
                  <Button
                    onClick={handleSavePassword}
                    disabled={updatingPass || newPassword.length < 6}
                    className="h-10 text-xs px-4"
                  >
                    {updatingPass ? "Guardando…" : "Guardar"}
                  </Button>
                </div>
              </div>

              {/* Sección 3: Permisos de Administrador */}
              <div className="space-y-3 pt-5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Permisos de Administrador</Label>
                {selectedUser.user_id === currentUserId ? (
                  <p className="text-xs text-muted-foreground italic">No puedes revocar tus propios permisos de administrador.</p>
                ) : selectedUser.is_admin ? (
                  <Button
                    variant="destructive"
                    className="w-full h-10 text-xs rounded-md"
                    onClick={() => handleToggleAdmin(selectedUser)}
                  >
                    Quitar Permisos de Administrador
                  </Button>
                ) : (
                  <div className="space-y-2.5 border border-border/60 p-3 rounded-lg bg-background/50">
                    <p className="text-[11px] text-muted-foreground leading-normal">
                      Escribe <strong className="text-foreground font-semibold">CONFIRMAR</strong> a continuación para convertir a este usuario en administrador:
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={confirmAdminText}
                        onChange={(e) => setConfirmAdminText(e.target.value)}
                        placeholder="CONFIRMAR"
                        className="h-9 text-xs rounded-md flex-1"
                      />
                      <Button
                        className="h-9 text-xs px-4"
                        onClick={() => handleToggleAdmin(selectedUser)}
                        disabled={confirmAdminText !== "CONFIRMAR"}
                      >
                        Hacer Admin
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Sección 4: Zona de Peligro (Eliminar) */}
              <div className="space-y-3 pt-5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-destructive">Eliminar Cuenta</Label>
                {selectedUser.user_id === currentUserId ? (
                  <p className="text-xs text-muted-foreground italic">No puedes eliminar tu propia cuenta desde aquí.</p>
                ) : (
                  <div className="space-y-2.5 border border-destructive/20 p-3 rounded-lg bg-destructive/5">
                    <p className="text-[11px] text-destructive leading-normal">
                      Se eliminarán todos sus datos y empresa de forma permanente. Escribe <strong className="font-bold">ELIMINAR</strong> para confirmar:
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={confirmDeleteText}
                        onChange={(e) => setConfirmDeleteText(e.target.value)}
                        placeholder="ELIMINAR"
                        className="h-9 text-xs border-destructive/20 text-destructive focus-visible:ring-destructive rounded-md flex-1"
                      />
                      <Button
                        variant="destructive"
                        className="h-9 text-xs px-4"
                        onClick={() => handleRemoveUser(selectedUser)}
                        disabled={confirmDeleteText !== "ELIMINAR"}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          <DialogFooter className="pt-2 border-t border-border/60">
            <Button variant="outline" onClick={() => setSelectedUser(null)} className="h-9 text-xs">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Plans tab ----------
function PlansTab() {
  const [plans, setPlans] = useState([]);
  const [freeRegActive, setFreeRegActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [savingReg, setSavingReg] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [plansRes, regRes] = await Promise.all([
        api.get("/admin/plans"),
        api.get("/admin/registration")
      ]);
      setPlans(plansRes.data);
      setFreeRegActive(regRes.data.free_registration_active);
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
        active: plan.active !== false,
      };
      await api.put(`/admin/plans/${plan.plan_id}`, payload);
      await load();
      toast.success(`Plan ${plan.name} actualizado`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos guardar");
    } finally { setSaving(null); }
  };

  const saveRegistration = async () => {
    setSavingReg(true);
    try {
      await api.put("/admin/registration", {
        free_registration_active: freeRegActive
      });
      toast.success("Configuración de registro actualizada");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos guardar la configuración");
    } finally {
      setSavingReg(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-5">
      {/* Configuración de Registro Gratis */}
      <div className="rounded-xl border border-border/60 bg-card p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold">Configuración de Registro de Usuarios</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Si desactivas el registro gratuito, los nuevos visitantes no podrán crear cuentas gratis y deberán suscribirse a un plan de pago.
            </p>
          </div>
          <button
            onClick={() => setFreeRegActive(!freeRegActive)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              freeRegActive ? "bg-primary" : "bg-muted"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                freeRegActive ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
        <div className="flex justify-end pt-2 border-t border-border/40">
          <Button
            size="sm"
            onClick={saveRegistration}
            disabled={savingReg}
            className="rounded-full h-8 px-4 text-xs"
          >
            {savingReg ? "Guardando…" : "Guardar Registro"}
          </Button>
        </div>
      </div>
      {plans.map((p) => (
        <div key={p.plan_id} className="rounded-xl border border-border/60 bg-card p-5 md:p-6 space-y-4" data-testid={`admin-plan-${p.plan_id}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">ID: {p.plan_id}</div>
                <h3 className="font-display text-lg font-semibold flex items-center gap-2 mt-0.5">
                  {p.name}
                  {p.active !== false ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20 text-[10px] h-5 py-0 px-2 rounded-full">
                      Activo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20 text-[10px] h-5 py-0 px-2 rounded-full">
                      Archivado
                    </Badge>
                  )}
                </h3>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const newActiveValue = p.active === false ? true : false;
                  const updatedPlan = { ...p, active: newActiveValue };
                  update(p.plan_id, "active", newActiveValue);
                  save(updatedPlan);
                }}
                disabled={saving === p.plan_id}
                size="sm"
                className={`rounded-full h-8 px-3.5 text-xs font-medium border transition-all duration-200 ${
                  p.active === false
                    ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/20"
                    : "text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 border-amber-500/20"
                }`}
              >
                {p.active === false ? "Activar" : "Archivar"}
              </Button>
              <Button onClick={() => save(p)} disabled={saving === p.plan_id} size="sm" className="rounded-full h-8" data-testid={`admin-save-plan-${p.plan_id}`}>
                {saving === p.plan_id ? "Guardando…" : "Guardar"}
              </Button>
            </div>
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


// ---------- Payment Gateways tab ----------
function PaymentGatewaysTab() {
  const [state, setState] = useState({
    stripe_api_key_masked: "", payphone_token_masked: "", payphone_store_id: "",
    has_stripe: false, has_payphone: false,
  });
  const [stripeApiKey, setStripeApiKey] = useState("");
  const [payphoneToken, setPayphoneToken] = useState("");
  const [payphoneStoreId, setPayphoneStoreId] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/payment-gateways");
      setState(data);
      setPayphoneStoreId(data.payphone_store_id || "");
    } catch (e) {
      toast.error("No pudimos cargar la configuración de pagos");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { payphone_store_id: payphoneStoreId };
      if (stripeApiKey) payload.stripe_api_key = stripeApiKey;
      if (payphoneToken) payload.payphone_token = payphoneToken;
      const { data } = await api.put("/admin/payment-gateways", payload);
      setState(data);
      setStripeApiKey(""); setPayphoneToken("");
      toast.success("Pasarelas de Pago actualizadas");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos guardar");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="rounded-xl border border-border/60 bg-card p-5 md:p-6 space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CreditCard className="h-4 w-4 text-primary" strokeWidth={1.5} />
          Configurá las credenciales de Stripe y PayPhone. Se priorizan sobre las variables de entorno de Railway.
        </div>

        <div className="space-y-4">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">Stripe</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Stripe API Key (Secret Key)</Label>
              {state.has_stripe && (
                <Badge variant="outline" className="border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] text-[10px]">
                  {state.stripe_api_key_masked}
                </Badge>
              )}
            </div>
            <Input
              type="password"
              value={stripeApiKey}
              onChange={(e) => setStripeApiKey(e.target.value)}
              placeholder={state.has_stripe ? "Dejar vacío para conservar la actual" : "sk_live_..."}
              className="h-11 rounded-lg"
              data-testid="admin-gateway-stripe"
            />
            <p className="text-xs text-muted-foreground">Clave privada (Secret Key) de Stripe para procesar cobros internacionales.</p>
          </div>
        </div>

        <div className="pt-6 border-t border-border/60 space-y-4">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">PayPhone</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Token de autenticación (Bearer Token)</Label>
              {state.has_payphone && (
                <Badge variant="outline" className="border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] text-[10px]">
                  {state.payphone_token_masked}
                </Badge>
              )}
            </div>
            <Input
              type="password"
              value={payphoneToken}
              onChange={(e) => setPayphoneToken(e.target.value)}
              placeholder={state.has_payphone ? "Dejar vacío para conservar la actual" : "token de autenticación"}
              className="h-11 rounded-lg"
              data-testid="admin-gateway-payphone-token"
            />
            <p className="text-xs text-muted-foreground">Token Bearer generado en la consola de desarrollador de PayPhone.</p>
          </div>

          <div className="space-y-2">
            <Label>Store ID</Label>
            <Input
              value={payphoneStoreId}
              onChange={(e) => setPayphoneStoreId(e.target.value)}
              placeholder="Store ID de la sucursal"
              className="h-11 rounded-lg"
              data-testid="admin-gateway-payphone-store"
            />
            <p className="text-xs text-muted-foreground">El ID único que identifica tu sucursal o comercio dentro de PayPhone.</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="rounded-full h-10 px-5" data-testid="admin-gateways-save-btn">
            {saving ? "Guardando…" : (<><Check className="h-4 w-4 mr-1.5" strokeWidth={1.5} />Guardar</>)}
          </Button>
        </div>
      </div>
    </div>
  );
}


// ---------- Branding tab ----------
function BrandingTab() {
  const { logoLight, logoDark, companyName, fontFamily, refreshBranding } = useBranding();
  const [newLogoLight, setNewLogoLight] = useState("");
  const [newLogoDark, setNewLogoDark] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newFontFamily, setNewFontFamily] = useState("Exo 2");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNewLogoLight(logoLight || "");
    setNewLogoDark(logoDark || "");
    setNewCompanyName(companyName || "STRATELIQ");
    setNewFontFamily(fontFamily || "Exo 2");
  }, [logoLight, logoDark, companyName, fontFamily]);

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!["image/png", "image/svg+xml"].includes(file.type)) {
      toast.error("Solo se permiten archivos PNG o SVG");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === "light") {
        setNewLogoLight(reader.result);
      } else {
        setNewLogoDark(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleReset = (type) => {
    if (type === "light") {
      setNewLogoLight("");
    } else {
      setNewLogoDark("");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/branding", {
        logo_light: newLogoLight || null,
        logo_dark: newLogoDark || null,
        company_name: newCompanyName.trim() || "STRATELIQ",
        font_family: newFontFamily,
      });
      await refreshBranding();
      toast.success("Personalización de marca actualizada");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No pudimos guardar los cambios de marca");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 md:p-6 space-y-6">
      <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" strokeWidth={1.5} />
        <div>
          <span className="font-semibold text-foreground">Personalización de Marca Blanca:</span>
          <p className="mt-1">
            Aquí puedes personalizar la identidad visual del logo. Puedes modificar el nombre comercial que se visualiza en la interfaz, su fuente tipográfica de Google Fonts y subir logotipos independientes para el modo claro y oscuro.
          </p>
        </div>
      </div>

      {/* Nombre y Fuente */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl border border-border/40 bg-background/30">
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Nombre de la Aplicación (Logo)</Label>
          <Input
            value={newCompanyName}
            onChange={(e) => setNewCompanyName(e.target.value)}
            placeholder="STRATELIQ"
            className="h-10 rounded-lg"
          />
          <p className="text-xs text-muted-foreground">El nombre de marca que se renderiza al lado del isotipo.</p>
        </div>
        
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Fuente Tipográfica (Google Fonts)</Label>
          <select
            value={newFontFamily}
            onChange={(e) => setNewFontFamily(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="Exo 2">Exo 2 (Por defecto)</option>
            <option value="Inter">Inter</option>
            <option value="Outfit">Outfit</option>
            <option value="Manrope">Manrope</option>
            <option value="Montserrat">Montserrat</option>
            <option value="Space Grotesk">Space Grotesk</option>
            <option value="Playfair Display">Playfair Display</option>
            <option value="Syne">Syne</option>
            <option value="Roboto">Roboto</option>
            <option value="Cinzel">Cinzel</option>
          </select>
          <p className="text-xs text-muted-foreground">La tipografía que se cargará dinámicamente desde Google Fonts para el texto del logo.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Logo Modo Claro */}
        <div className="space-y-3 p-4 rounded-xl border border-border/40 bg-background/50 flex flex-col justify-between">
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Logotipo para Modo Claro</Label>
            <p className="text-xs text-muted-foreground">Se mostrará cuando el tema de la plataforma sea claro.</p>
          </div>
          <div className="my-4 flex items-center justify-center h-28 border border-dashed border-border/60 rounded-lg bg-white relative group overflow-hidden">
            {newLogoLight ? (
              <>
                <img src={newLogoLight} alt="Logo Light Preview" className="max-h-20 max-w-[80%] object-contain" />
                <button
                  onClick={() => handleReset("light")}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold rounded-lg transition-opacity duration-200"
                >
                  Cambiar / Quitar
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-muted-foreground text-xs text-center p-4">
                <Image className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
                <span>No hay logotipo personalizado</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="w-full relative h-10 rounded-lg border border-border"
              asChild
            >
              <label className="cursor-pointer flex items-center justify-center gap-1.5 text-xs">
                <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                Subir Logo Claro
                <input
                  type="file"
                  accept="image/png, image/svg+xml"
                  onChange={(e) => handleFileChange(e, "light")}
                  className="hidden"
                />
              </label>
            </Button>
            {newLogoLight && (
              <Button
                variant="ghost"
                onClick={() => handleReset("light")}
                className="h-10 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Quitar
              </Button>
            )}
          </div>
        </div>

        {/* Logo Modo Oscuro */}
        <div className="space-y-3 p-4 rounded-xl border border-border/40 bg-background/50 flex flex-col justify-between">
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Logotipo para Modo Oscuro</Label>
            <p className="text-xs text-muted-foreground">Se mostrará cuando el tema de la plataforma sea oscuro.</p>
          </div>
          <div className="my-4 flex items-center justify-center h-28 border border-dashed border-border/60 rounded-lg bg-[#06080F] relative group overflow-hidden">
            {newLogoDark ? (
              <>
                <img src={newLogoDark} alt="Logo Dark Preview" className="max-h-20 max-w-[80%] object-contain" />
                <button
                  onClick={() => handleReset("dark")}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold rounded-lg transition-opacity duration-200"
                >
                  Cambiar / Quitar
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-muted-foreground text-xs text-center p-4">
                <Image className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
                <span>No hay logotipo personalizado</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="w-full relative h-10 rounded-lg border border-border"
              asChild
            >
              <label className="cursor-pointer flex items-center justify-center gap-1.5 text-xs">
                <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                Subir Logo Oscuro
                <input
                  type="file"
                  accept="image/png, image/svg+xml"
                  onChange={(e) => handleFileChange(e, "dark")}
                  className="hidden"
                />
              </label>
            </Button>
            {newLogoDark && (
              <Button
                variant="ghost"
                onClick={() => handleReset("dark")}
                className="h-10 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Quitar
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <Button onClick={save} disabled={saving} className="rounded-full h-10 px-5" data-testid="admin-branding-save-btn">
          {saving ? "Guardando…" : (<><Check className="h-4 w-4 mr-1.5" strokeWidth={1.5} />Guardar</>)}
        </Button>
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
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full md:w-auto md:inline-flex mb-6" data-testid="admin-tabs">
          <TabsTrigger value="model" data-testid="tab-model" className="gap-1.5"><Shield className="h-3.5 w-3.5" strokeWidth={1.5} />Modelo</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users" className="gap-1.5"><Users className="h-3.5 w-3.5" strokeWidth={1.5} />Usuarios</TabsTrigger>
          <TabsTrigger value="plans" data-testid="tab-plans" className="gap-1.5"><LayoutList className="h-3.5 w-3.5" strokeWidth={1.5} />Planes</TabsTrigger>
          <TabsTrigger value="keys" data-testid="tab-keys" className="gap-1.5"><KeyRound className="h-3.5 w-3.5" strokeWidth={1.5} />API Keys</TabsTrigger>
          <TabsTrigger value="gateways" data-testid="tab-gateways" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" strokeWidth={1.5} />Pasarelas</TabsTrigger>
          <TabsTrigger value="branding" data-testid="tab-branding" className="gap-1.5"><Palette className="h-3.5 w-3.5" strokeWidth={1.5} />Personalización</TabsTrigger>
        </TabsList>

        <TabsContent value="model"><ModelTab /></TabsContent>
        <TabsContent value="users"><UsersTab currentUserId={user.user_id} /></TabsContent>
        <TabsContent value="plans"><PlansTab /></TabsContent>
        <TabsContent value="keys"><ApiKeysTab /></TabsContent>
        <TabsContent value="gateways"><PaymentGatewaysTab /></TabsContent>
        <TabsContent value="branding"><BrandingTab /></TabsContent>
      </Tabs>
    </div>
  );
}
