import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bell, CreditCard, User, LogOut, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 md:p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <Icon className="h-4 w-4 text-primary" strokeWidth={1.5} />
        <h2 className="font-display text-base md:text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function Settings() {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [notif, setNotif] = useState(() => localStorage.getItem("strateliq-notif") !== "false");

  const saveName = async () => {
    setSavingName(true);
    try {
      await api.put("/profile", { name });
      await refresh();
      toast.success("Perfil actualizado");
    } catch (e) {
      toast.error("No pudimos guardar tu perfil");
    } finally {
      setSavingName(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  const toggleNotif = (v) => {
    setNotif(v);
    localStorage.setItem("strateliq-notif", String(v));
    toast.success(v ? "Notificaciones activadas" : "Notificaciones desactivadas");
  };

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Cuenta</div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Configuración</h1>
      </div>

      <div className="space-y-5">
        <Section icon={User} title="Perfil">
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="h-14 w-14 border border-border/60">
              <AvatarImage src={user?.picture} />
              <AvatarFallback className="bg-secondary">{(user?.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("")}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{user?.name}</div>
              <div className="text-sm text-muted-foreground">{user?.email}</div>
            </div>
          </div>
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="name">Nombre</Label>
            <div className="flex gap-2">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-lg" data-testid="profile-name-input" />
              <Button onClick={saveName} disabled={savingName || !name.trim()} className="rounded-lg h-10" data-testid="profile-save-btn">
                {savingName ? "…" : <Check className="h-4 w-4" strokeWidth={1.5} />}
              </Button>
            </div>
          </div>
        </Section>

        <Section icon={CreditCard} title="Suscripción">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-medium">Plan Founder · Gratis</div>
              <div className="text-sm text-muted-foreground mt-1">Acceso completo al Comité Ejecutivo Virtual.</div>
            </div>
            <Button variant="outline" className="rounded-full" data-testid="upgrade-btn" disabled>
              Actualizar plan
            </Button>
          </div>
        </Section>

        <Section icon={Bell} title="Notificaciones">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Correos de resumen</div>
              <div className="text-sm text-muted-foreground mt-1">Recibe un resumen semanal de tus decisiones.</div>
            </div>
            <Switch checked={notif} onCheckedChange={toggleNotif} data-testid="notif-toggle" />
          </div>
        </Section>

        <Section icon={LogOut} title="Sesión">
          <Button
            variant="outline"
            className="rounded-full text-destructive hover:text-destructive"
            onClick={handleLogout}
            data-testid="settings-logout-btn"
          >
            <LogOut className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
            Cerrar sesión
          </Button>
        </Section>
      </div>
    </div>
  );
}
