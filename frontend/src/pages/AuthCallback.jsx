import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth, supabase } from "@/context/AuthContext";
import { toast } from "sonner";

export default function AuthCallback() {
  const hasProcessed = useRef(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash || "";
    if (hash.includes("access_token=") || hash.includes("id_token=")) {
      // Dejar que Supabase procese el token en el AuthContext
      setTimeout(() => {
        navigate("/app", { replace: true });
      }, 1000);
      return;
    }

    const match = hash.match(/session_id=([^&]+)/);
    if (!match) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          navigate("/app", { replace: true });
        } else {
          navigate("/login", { replace: true });
        }
      });
      return;
    }
    const sessionId = decodeURIComponent(match[1]);

    (async () => {
      try {
        const { data } = await api.post("/auth/session", { session_id: sessionId });
        setUser(data.user);
        window.history.replaceState(null, "", window.location.pathname);
        toast.success("Sesión iniciada");
        navigate(data.user.onboarding_completed ? "/app" : "/onboarding", { replace: true });
      } catch (e) {
        toast.error("No pudimos completar la autenticación");
        navigate("/login", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <div className="text-sm text-muted-foreground">Autenticando…</div>
      </div>
    </div>
  );
}
