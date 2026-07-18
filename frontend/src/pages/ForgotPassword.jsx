import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/context/AuthContext";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      setSent(true);
      toast.success("Revisa tu correo");
    } catch (err) {
      toast.error(err?.message || "Hubo un problema, intenta nuevamente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-5 md:px-8 h-16 border-b border-border/50">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="back-login-link">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Volver</span>
        </Link>
        <Logo />
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          {sent ? (
            <div className="text-center animate-fade-up">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-secondary mb-5">
                <MailCheck className="h-5 w-5 text-[hsl(var(--success))]" strokeWidth={1.5} />
              </div>
              <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-3">
                Revisa tu correo
              </h1>
              <p className="text-muted-foreground mb-8">
                Si el correo <strong className="text-foreground font-medium">{email}</strong> está registrado, te enviamos un enlace para restablecer tu contraseña. Expira en 1 hora.
              </p>
              <Link to="/login">
                <Button variant="outline" className="rounded-full" data-testid="back-to-login-btn">
                  Volver al inicio de sesión
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-10">
                <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
                  Recupera tu acceso
                </h1>
                <p className="mt-3 text-muted-foreground">
                  Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
                </p>
              </div>
              <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-lg"
                    data-testid="forgot-email-input"
                    placeholder="tu@empresa.com"
                  />
                </div>
                <Button type="submit" className="w-full h-11 rounded-lg" disabled={loading} data-testid="forgot-submit-btn">
                  {loading ? "Enviando…" : "Enviar enlace"}
                </Button>
              </form>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                <Link to="/login" className="text-foreground font-medium underline underline-offset-4">
                  Volver al inicio de sesión
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
