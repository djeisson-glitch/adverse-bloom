import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Timer, Plus, Trash2, CalendarCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Entry = {
  id: string;
  project_id: string;
  start_at: string;
  duration_min: number;
  description: string | null;
  billable: boolean;
  source: string;
  project?: { name: string; client_name?: string | null } | null;
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function Horas() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [form, setForm] = useState({
    project_id: "",
    data: iso(new Date()),
    inicio: "09:00",
    duracao: "60",
    descricao: "",
    faturavel: true,
  });

  const fromDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString();
  }, []);

  const { data: entries = [] } = useQuery({
    queryKey: ["horas-me", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("time_entries")
        .select("*, project:projects(name, client_name)")
        .eq("user_id", user!.id)
        .gte("start_at", fromDate)
        .order("start_at", { ascending: false });
      if (error) throw error;
      return data as Entry[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["horas-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, client_name")
        .neq("status", "faturado")
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const totalHoras = useMemo(
    () => entries.reduce((sum, e) => sum + e.duration_min, 0) / 60,
    [entries],
  );

  const lancar = useMutation({
    mutationFn: async () => {
      if (!form.project_id) throw new Error("Escolha um projeto");
      if (!form.data) throw new Error("Informe a data");
      const [h, m] = form.inicio.split(":").map(Number);
      const start = new Date(`${form.data}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
      const { error } = await (supabase as any).from("time_entries").insert({
        user_id: user!.id,
        project_id: form.project_id,
        start_at: start.toISOString(),
        duration_min: Math.max(1, Number(form.duracao)),
        description: form.descricao || null,
        billable: form.faturavel,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ ...form, descricao: "", duracao: "60" });
      qc.invalidateQueries({ queryKey: ["horas-me"] });
      toast.success("Horas lançadas");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["horas-me"] }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Timer className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Minhas horas</h1>
            <p className="text-sm text-muted-foreground">
              Últimos 14 dias · total <strong>{totalHoras.toFixed(1)}h</strong>. Use o timer na barra
              superior (ou o ▶ no projeto/tarefa) — ou lance manualmente abaixo.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => toast.info("Importar da agenda chega em melhoria futura")}>
          <CalendarCheck className="mr-1 h-3.5 w-3.5" />
          Importar da agenda
        </Button>
      </div>

      <Card className="glass-card">
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Projeto</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="— selecione —" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.client_name || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div>
                <Label>Início</Label>
                <Input type="time" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
              </div>
              <div>
                <Label>Duração (min)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.duracao}
                  onChange={(e) => setForm({ ...form, duracao: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Input
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="O que foi feito?"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={form.faturavel}
                onChange={(e) => setForm({ ...form, faturavel: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              Faturável
            </label>
            <Button onClick={() => lancar.mutate()} disabled={lancar.isPending} className="bg-primary text-primary-foreground">
              <Plus className="mr-1 h-4 w-4" /> Lançar horas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum apontamento ainda. Inicie o timer ou lance manualmente acima.
            </div>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[100px_1fr_120px_60px_60px_40px] items-center gap-3 border-b border-border/40 px-5 py-3 text-sm last:border-0"
              >
                <span className="text-xs text-muted-foreground">
                  {new Date(e.start_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-foreground">{e.project?.name || "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.description || "—"}</p>
                </div>
                <span className="text-xs text-muted-foreground">{e.source}</span>
                <span className="text-right text-xs">
                  {(e.duration_min / 60).toFixed(1)}h
                </span>
                <span className={`text-xs ${e.billable ? "text-success" : "text-muted-foreground"}`}>
                  {e.billable ? "R$" : "—"}
                </span>
                <button onClick={() => excluir.mutate(e.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
