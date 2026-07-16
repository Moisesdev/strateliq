import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught error", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-5">
          <div className="max-w-md w-full text-center" data-testid="error-boundary">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-secondary mb-5">
              <AlertTriangle className="h-5 w-5 text-destructive" strokeWidth={1.5} />
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-3">
              Algo salió mal
            </h1>
            <p className="text-muted-foreground mb-6">
              Ocurrió un error inesperado. Intenta recargar o volver al inicio.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={this.reset} className="rounded-full" data-testid="error-reset-btn">
                Reintentar
              </Button>
              <Button onClick={() => (window.location.href = "/app")} className="rounded-full" data-testid="error-home-btn">
                Ir al inicio
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
