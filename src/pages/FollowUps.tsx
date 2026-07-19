import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarRange, ChevronLeft, ChevronRight, Trophy, Frown, Check, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

type FollowUp = {
  id: string;
  deal_id: string | null;
  data_prevista: string;
  tipo: string;
  status: string;
  descricao: string | null;
  deal?: { id: string; title: string; client?: { name: string } | null } | null;
};

function monthLabel(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function firstDow(y: number, m: number) {
  return new Date(y, m, 1).getDay();
}

export default function FollowUps() {
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(() => new Date());

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const from = iso(new Date(y, m, 1));
  const to = iso(new Date(y, m + 1, 0));

  const { data: followUps = [] } = useQuery({
    queryKey: ["follow-ups", from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("follow_ups")
        .select("*, deal:deals(id, title, client:clients(name))")
        .gte("data_prevista", from)
        .lte("data_prevista", to)
        .order("data_prevista");
      if (error) throw error;
      return data as FollowUp[];
    },
  });

  const { data: pendentes = [] } = useQuery({
    queryKey: ["follow-ups-pendentes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("follow_ups")
        .select("*, deal:deals(id, title, client:clients(name))")
        .eq("status", "pendente")
        .order("data_prevista");
      if (error) throw error;
      return data as FollowUp[];
    },
  });

  const marcadores = useMemo(() => {
    const map: Record<string, FollowUp[]> = {};
    followUps.forEach((f) => {
      map[f.data_prevista] = map[f.data_prevista] || [];
      map[f.data_prevista].push(f);
    });
    return map;
  }, [followUps]);

  const concluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("follow_ups")
        .update({ status: "concluido", concluido_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["follow-ups"] });
      qc.invalidateQueries({ queryKey: ["follow-ups-pendentes"] });
      toast.success("Follow-up concluído");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  // grid mensal
  const dow = firstDow(y, m);
  const dim = daysInMonth(y, m);
  const cells: (number | null)[] = [];
  for (let i = 0; i < dow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const today = iso(new Date());

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <CalendarRange className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Agenda de Follow-up</h1>
          <p className="text-sm text-muted-foreground">
            Lembretes automáticos +60 dias após cada orçamento{" "}
            <span className="text-success">ganho</span> ou{" "}
            <span className="text-destructive">perdido</span> — pra reabordar o cliente na hora certa.
          </p>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5 text-success" /> pós-ganho
              </span>
              <span className="flex items-center gap-1">
                <Frown className="h-3.5 w-3.5 text-destructive" /> pós-perda
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium capitalize text-foreground">
                {monthLabel(cursor)}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCursor(new Date(y, m - 1, 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>
                Hoje
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCursor(new Date(y, m + 1, 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
              <div key={d} className="px-2 py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d == null) return <div key={i} className="h-20 rounded-md" />;
              const date = iso(new Date(y, m, d));
              const dayFus = marcadores[date] || [];
              const isToday = date === today;
              const ganhos = dayFus.filter((f) => f.tipo === "pos_ganho").length;
              const perdas = dayFus.filter((f) => f.tipo === "pos_perda").length;
              return (
                <div
                  key={i}
                  className={`flex h-20 flex-col justify-between rounded-md border p-1.5 text-xs ${
                    isToday
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/40 bg-muted/10"
                  }`}
                >
                  <span className={`${isToday ? "text-primary" : "text-muted-foreground"} text-[11px]`}>
                    {d}
                  </span>
                  <div className="flex flex-wrap gap-0.5">
                    {ganhos > 0 && (
                      <span className="flex items-center gap-0.5 rounded bg-success/15 px-1 py-0.5 text-[9px] text-success">
                        <Trophy className="h-2.5 w-2.5" /> {ganhos}
                      </span>
                    )}
                    {perdas > 0 && (
                      <span className="flex items-center gap-0.5 rounded bg-destructive/15 px-1 py-0.5 text-[9px] text-destructive">
                        <Frown className="h-2.5 w-2.5" /> {perdas}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="border-b border-border/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pendentes ({pendentes.length})
          </div>
          {pendentes.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum follow-up pendente. 🎉
            </div>
          ) : (
            pendentes.map((f) => {
              const isGanho = f.tipo === "pos_ganho";
              const Icon = isGanho ? Trophy : Frown;
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-3 border-b border-border/40 px-5 py-3 last:border-0"
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      isGanho ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {f.deal?.client?.name || "Cliente"} · {f.deal?.title || "—"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {f.descricao || (isGanho ? "Reabordar cliente pós-ganho" : "Reabordar cliente pós-perda")}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(f.data_prevista)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => concluir.mutate(f.id)}
                    disabled={concluir.isPending}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Concluir
                  </Button>
                  <button
                    title="Excluir follow-up"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      if (!window.confirm("Excluir este follow-up?")) return;
                      const { error } = await (supabase as any).from("follow_ups").delete().eq("id", f.id);
                      if (error) return toast.error("Não excluiu", { description: error.message });
                      qc.invalidateQueries();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
