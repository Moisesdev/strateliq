import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api } from "@/lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      toast.error("Enlace inválido");
      navigate("/login", { replace: true });
    }
  }, [token, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Mínimo 6 caracteres");
    if (password !== confirm) return toast.error("Las contraseñas no coinciden");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setDone(true);
      toast.success("Contraseña actualizada");
      setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "El enlace es inválido o expiró");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-5 md:px-8 h-16 border-b border-border/50">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Volver</span>
        </Link>
        <Logo />
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          {done ? (
            <div className="text-center animate-fade-up">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-secondary mb-5">
                <Check className="h-5 w-5 text-[hsl(var(--success))]" strokeWidth={1.5} />
              </div>
              <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-3">
                Contraseña actualizada
              </h1>
              <p className="text-muted-foreground">Redirigiendo al inicio de sesión…</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-10">
                <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Nueva contraseña</h1>
                <p className="mt-3 text-muted-foreground">Elige una contraseña segura para tu cuenta.</p>
              </div>
              <form onSubmit={submit} className="space-y-4" data-testid="reset-form">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Nueva contraseña</Label>
                  <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-lg" data-testid="reset-password-input" placeholder="Mínimo 6 caracteres" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirmar contraseña</Label>
                  <Input id="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11 rounded-lg" data-testid="reset-confirm-input" />
                </div>
                <Button type="submit" className="w-full h-11 rounded-lg" disabled={loading} data-testid="reset-submit-btn">
                  {loading ? "Guardando…" : "Cambiar contraseña"}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
