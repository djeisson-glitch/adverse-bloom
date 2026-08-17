import { useMemo, useState } from "react";
import { dataISO } from "@/lib/dataLocal";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Marker =
  | { tipo: "entregavel"; label: string; projectId: string; id: string; color: string }
  | { tipo: "tarefa"; label: string; projectId: string | null; id: string; color: string }
  | { tipo: "prazo"; label: string; projectId: string; id: string; color: string }
  /** Toque de nutrição: `projectId` carrega o id do LEAD, pro clique abrir a ficha dele. */
  | { tipo: "lead"; label: string; projectId: string; id: string; color: string };

function iso(d: Date) {
  return dataISO(d);
}

export default function Calendario() {
  const [cursor, setCursor] = useState(() => new Date());
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const from = iso(new Date(y, m, 1));
  const to = iso(new Date(y, m + 1, 0));

  const { data: tarefas = [] } = useQuery({
    queryKey: ["cal-tasks", from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tasks")
        .select("id, title, due_date, project_id, project:projects(id, name)")
        .not("due_date", "is", null)
        .gte("due_date", from)
        .lte("due_date", to);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: entregaveis = [] } = useQuery({
    queryKey: ["cal-entregaveis", from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverables")
        .select("id, titulo, data_entrega, project_id, project:projects(id, name)")
        .not("data_entrega", "is", null)
        .gte("data_entrega", from)
        .lte("data_entrega", to);
      if (error) throw error;
      return data as any[];
    },
  });

  /**
   * Toques de lead — "já vai pra agenda" (Djêisson, 14/08).
   *
   * O lead nasce com data de próximo toque; aqui ela vira compromisso no
   * calendário, do mesmo jeito que entrega e diária. Sem isso a data existia
   * só na ficha do lead, e agenda que não mostra o compromisso não é agenda.
   */
  const { data: toques = [] } = useQuery({
    queryKey: ["cal-leads", from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("leads")
        .select("id, nome, empresa, proximo_toque, motivo_toque, status")
        .not("proximo_toque", "is", null)
        .gte("proximo_toque", from)
        .lte("proximo_toque", to);
      if (error) throw error;
      return ((data as any[]) || []).filter((l) => !["convertido", "descartado"].includes(l.status));
    },
  });

  const { data: prazos = [] } = useQuery({
    queryKey: ["cal-prazos", from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("projects")
        .select("id, name, delivery_date")
        .not("delivery_date", "is", null)
        .gte("delivery_date", from)
        .lte("delivery_date", to);
      if (error) throw error;
      return data as any[];
    },
  });

  // Saídas de produção (diárias, visitas técnicas, saídas) — o mesmo dado que
  // vai pro Google Agenda, aqui dentro do calendário do OS.
  const { data: saidas = [] } = useQuery({
    queryKey: ["cal-saidas", from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("producao_saidas")
        .select("id, titulo, tipo, data, project_id, status")
        .neq("status", "cancelada")
        .gte("data", from)
        .lte("data", to);
      if (error) throw error;
      return data as any[];
    },
  });

  const SAIDA_STYLE: Record<string, { emoji: string; color: string }> = {
    diaria: { emoji: "🎥", color: "#f59e0b" },
    visita_tecnica: { emoji: "🔎", color: "#3b82f6" },
    saida: { emoji: "🚐", color: "#a855f7" },
  };

  const byDate = useMemo(() => {
    const map = new Map<string, Marker[]>();
    tarefas.forEach((t) => {
      const key = t.due_date.slice(0, 10);
      // Diária de gravação (captação) ganha cor própria — é o calendário de
      // produção dentro do calendário: câmera na rua ≠ tarefa comum.
      const diaria = (t.title || "").startsWith("Diária");
      map.set(key, [
        ...(map.get(key) || []),
        {
          tipo: "tarefa",
          label: diaria ? `🎥 ${t.title}` : t.title,
          projectId: t.project_id,
          id: t.id,
          color: diaria ? "#f59e0b" : "#e5e7eb",
        },
      ]);
    });
    entregaveis.forEach((e) => {
      const key = e.data_entrega.slice(0, 10);
      map.set(key, [
        ...(map.get(key) || []),
        { tipo: "entregavel", label: e.titulo, projectId: e.project_id, id: e.id, color: "#22c55e" },
      ]);
    });
    toques.forEach((l: any) => {
      const key = String(l.proximo_toque).slice(0, 10);
      map.set(key, [
        ...(map.get(key) || []),
        {
          tipo: "lead",
          label: `☎️ ${l.nome}${l.empresa ? ` · ${l.empresa}` : ""}${l.motivo_toque ? ` — ${l.motivo_toque}` : ""}`,
          projectId: l.id, id: l.id, color: "#10b981",
        },
      ]);
    });
    prazos.forEach((p) => {
      const key = p.delivery_date.slice(0, 10);
      map.set(key, [
        ...(map.get(key) || []),
        { tipo: "prazo", label: `🎯 ${p.name}`, projectId: p.id, id: p.id, color: "#ef4444" },
      ]);
    });
    saidas.forEach((s) => {
      const key = s.data.slice(0, 10);
      const st = SAIDA_STYLE[s.tipo] || SAIDA_STYLE.saida;
      map.set(key, [
        ...(map.get(key) || []),
        { tipo: "tarefa", label: `${st.emoji} ${s.titulo}`, projectId: s.project_id, id: `saida-${s.id}`, color: st.color },
      ]);
    });
    return map;
  }, [tarefas, entregaveis, prazos, saidas]);

  const firstDow = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const today = iso(new Date());
  const totalMarcadores = tarefas.length + entregaveis.length + prazos.length + saidas.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Calendário de entregas</h1>
          <p className="text-sm text-muted-foreground">
            {totalMarcadores} datas marcadas · tarefas e prazos dos projetos
          </p>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-success" />
                Entregável
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-white/70" />
                Tarefa
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                Prazo do projeto
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium capitalize text-foreground">
                {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </span>
              <Button size="sm" variant="outline" onClick={() => setCursor(new Date(y, m - 1, 1))}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>
                Hoje
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCursor(new Date(y, m + 1, 1))}>
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
              if (d == null) return <div key={i} className="h-24 rounded-md" />;
              const key = iso(new Date(y, m, d));
              const dayMarkers = byDate.get(key) || [];
              const isToday = key === today;
              return (
                <div
                  key={i}
                  className={`flex h-24 flex-col justify-between rounded-md border p-1.5 text-xs ${
                    isToday ? "border-primary/40 bg-primary/5" : "border-border/40 bg-muted/10"
                  }`}
                >
                  <span className={`${isToday ? "text-primary" : "text-muted-foreground"} text-[11px]`}>
                    {d}
                  </span>
                  <div className="space-y-0.5">
                    {dayMarkers.slice(0, 3).map((mk) => (
                      <Link
                        key={mk.id}
                        // Toque de lead abre a FICHA DO LEAD; o resto vai pro
                        // projeto. Sem isto o clique levava a /projetos/<id do
                        // lead> e caía numa tela que não existe.
                        to={mk.tipo === "lead" ? `/leads/${mk.id}` : mk.projectId ? `/projetos/${mk.projectId}` : "#"}
                        className="block truncate rounded px-1 py-0.5 text-[9px]"
                        style={{ background: `${mk.color}22`, color: mk.color }}
                        title={mk.label}
                      >
                        {mk.label}
                      </Link>
                    ))}
                    {dayMarkers.length > 3 && (
                      <span className="block text-[9px] text-muted-foreground">+{dayMarkers.length - 3}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
