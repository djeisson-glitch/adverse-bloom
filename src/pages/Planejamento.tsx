import { useMemo, useState } from "react";
import { dataISO } from "@/lib/dataLocal";
import { primeiroNome } from "@/lib/pessoa";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { CalendarClock, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PessoaAvatar } from "@/components/PessoaAvatar";
import { toast } from "sonner";

function startOfWeek(base: Date) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function addWeeks(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n * 7);
  return d;
}
function iso(d: Date) {
  return dataISO(d);
}

export default function Planejamento() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { canSeeMoney } = usePermissions();

  const semanas = useMemo(() => {
    const base = startOfWeek(new Date());
    return Array.from({ length: 6 }, (_, i) => addWeeks(base, i));
  }, []);
  const semanaFrom = iso(semanas[0]);
  const semanaTo = iso(addWeeks(semanas[5], 1));

  const [form, setForm] = useState({ user_id: "", project_id: "", semana: iso(semanas[0]), horas: "" });

  const { data: profiles = [] } = useQuery({
    queryKey: ["plan-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, horas_semana, avatar_url")
        .neq("ativo", false)
        .order("full_name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["plan-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name, client_name").neq("status", "faturado").order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: alocacoes = [] } = useQuery({
    queryKey: ["plan-alocacoes", semanaFrom, semanaTo],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("time_planning")
        .select("*")
        .gte("semana", semanaFrom)
        .lt("semana", semanaTo);
      if (error) throw error;
      return data as any[];
    },
  });

  const alocado = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    alocacoes.forEach((a) => {
      const row = m.get(a.user_id) || new Map();
      row.set(iso(new Date(a.semana)), (row.get(iso(new Date(a.semana))) || 0) + Number(a.horas));
      m.set(a.user_id, row);
    });
    return m;
  }, [alocacoes]);

  const criar = useMutation({
    mutationFn: async () => {
      if (!form.user_id || !form.project_id || !form.semana || !form.horas) {
        throw new Error("Preencha todos os campos");
      }
      const { error } = await (supabase as any).from("time_planning").upsert(
        {
          user_id: form.user_id,
          project_id: form.project_id,
          semana: form.semana,
          horas: Number(form.horas),
          created_by: user?.id || null,
        },
        { onConflict: "user_id,project_id,semana" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ ...form, horas: "" });
      qc.invalidateQueries({ queryKey: ["plan-alocacoes"] });
      toast.success("Alocação registrada");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const cellState = (userId: string, semana: Date, cap: number) => {
    const h = alocado.get(userId)?.get(iso(semana)) || 0;
    if (h === 0) return { h, cls: "text-muted-foreground", label: "·" };
    if (h < cap * 0.85) return { h, cls: "bg-primary/15 text-primary", label: `${h}h` };
    if (h <= cap) return { h, cls: "bg-success/15 text-success", label: `${h}h` };
    return { h, cls: "bg-destructive/15 text-destructive", label: `${h}h` };
  };

  if (!canSeeMoney) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-sm text-muted-foreground">
        Disponível só para quem tem acesso ao financeiro ao Planejamento.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <CalendarClock className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Planejamento de capacidade</h1>
          <p className="text-sm text-muted-foreground">
            Horas planejadas por pessoa nas próximas 6 semanas vs. capacidade de cada um.
          </p>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pessoa
                </th>
                {semanas.map((s, i) => (
                  <th key={i} className="px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {i === 0 ? "esta sem." : "sem " + s.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <PessoaAvatar nome={p.full_name || p.email} foto={p.avatar_url} seed={p.id} tamanho={24} />
                      <div>
                        <p className="text-sm text-foreground">{primeiroNome(p.full_name || p.email)}</p>
                        <p className="text-[10px] text-muted-foreground">{p.horas_semana || 40}h/sem</p>
                      </div>
                    </div>
                  </td>
                  {semanas.map((s, i) => {
                    const st = cellState(p.id, s, p.horas_semana || 40);
                    return (
                      <td key={i} className="px-1 py-1 text-center">
                        <span className={`inline-block min-w-[40px] rounded px-2 py-1 text-xs ${st.cls}`}>{st.label}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-primary/15 px-2 py-1 text-primary">parcial</span>
        <span className="rounded bg-success/15 px-2 py-1 text-success">cheio</span>
        <span className="rounded bg-destructive/15 px-2 py-1 text-destructive">sobrecarga</span>
        <span className="text-muted-foreground">— passe o mouse pra ver horas livres.</span>
      </div>

      <Card className="glass-card">
        <CardContent className="space-y-3 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Alocar horas planejadas
          </p>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px_100px_120px]">
            <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Pessoa…" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {primeiroNome(p.full_name || p.email)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Projeto…" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={form.semana} onValueChange={(v) => setForm({ ...form, semana: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Semana…" />
              </SelectTrigger>
              <SelectContent>
                {semanas.map((s) => (
                  <SelectItem key={iso(s)} value={iso(s)}>
                    sem {s.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              placeholder="horas"
              value={form.horas}
              onChange={(e) => setForm({ ...form, horas: e.target.value })}
            />
            <Button onClick={() => criar.mutate()} disabled={criar.isPending} className="bg-primary text-primary-foreground">
              <Plus className="mr-1 h-4 w-4" /> Alocar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
