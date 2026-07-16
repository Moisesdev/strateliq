import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { register, loginGoogle } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      await register(email, password, name);
      toast.success("Cuenta creada");
      navigate("/onboarding", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No pudimos crear tu cuenta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-5 md:px-8 h-16 border-b border-border/50">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="back-home-link">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Volver</span>
        </Link>
        <Logo />
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Crea tu cuenta</h1>
            <p className="mt-3 text-muted-foreground">Empieza a consultar a tu Comité Ejecutivo Virtual.</p>
          </div>

          <Button
            variant="outline"
            className="w-full h-11 rounded-lg justify-center gap-3 font-medium"
            onClick={loginGoogle}
            data-testid="google-signup-btn"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335" />
            </svg>
            Continuar con Google
          </Button>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">o</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-4" data-testid="register-form">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-lg" data-testid="register-name-input" placeholder="Tu nombre" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-lg" data-testid="register-email-input" placeholder="tu@empresa.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-lg" data-testid="register-password-input" placeholder="Mínimo 6 caracteres" />
            </div>
            <Button type="submit" className="w-full h-11 rounded-lg" disabled={loading} data-testid="register-submit-btn">
              {loading ? "Creando…" : "Crear cuenta"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="text-foreground font-medium underline underline-offset-4" data-testid="link-to-login">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
