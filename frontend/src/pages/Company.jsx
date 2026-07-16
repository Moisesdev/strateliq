import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

const FIELDS = [
  { key: "company_name", label: "Empresa", type: "input", placeholder: "Nombre de tu empresa" },
  { key: "objectives", label: "Objetivos", type: "textarea", placeholder: "¿Qué quieres lograr en los próximos 6-12 meses?" },
  { key: "products", label: "Productos", type: "textarea", placeholder: "Describe tus productos o servicios principales" },
  { key: "customers", label: "Clientes", type: "textarea", placeholder: "¿Quiénes son tus clientes ideales?" },
  { key: "competitors", label: "Competidores", type: "textarea", placeholder: "Principales competidores y qué los diferencia" },
  { key: "market", label: "Mercado", type: "textarea", placeholder: "Tamaño, tendencias y contexto de tu mercado" },
];

export default function Company() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/company");
        setData(data);
      } catch (e) {
        toast.error("No pudimos cargar tu empresa");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      FIELDS.forEach(({ key }) => { payload[key] = data[key] ?? ""; });
      await api.put("/company", payload);
      toast.success("Guardado");
    } catch (e) {
      toast.error("No pudimos guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Memoria del Comité</div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Mi Empresa</h1>
        <p className="mt-3 text-muted-foreground">Mientras más contexto tenga tu Comité, mejores recomendaciones entregará.</p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : (
        <div className="space-y-6">
          {FIELDS.map(({ key, label, type, placeholder }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key} className="text-sm font-medium">{label}</Label>
              {type === "input" ? (
                <Input
                  id={key}
                  value={data[key] || ""}
                  onChange={(e) => setData({ ...data, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="h-11 rounded-lg"
                  data-testid={`company-${key}`}
                />
              ) : (
                <Textarea
                  id={key}
                  value={data[key] || ""}
                  onChange={(e) => setData({ ...data, [key]: e.target.value })}
                  placeholder={placeholder}
                  rows={4}
                  className="rounded-lg resize-none"
                  data-testid={`company-${key}`}
                />
              )}
            </div>
          ))}

          <div className="pt-4 flex justify-end">
            <Button onClick={save} disabled={saving} className="rounded-full h-10 px-5" data-testid="company-save-btn">
              {saving ? "Guardando…" : (<><Save className="h-4 w-4 mr-1.5" strokeWidth={1.5} /> Guardar cambios</>)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
