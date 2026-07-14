import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { Clapperboard, AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

/**
 * Onda 3 — Pós-Produção.
 * Fila de projetos ativos com etapa relacionada a edição/pós, com
 * capacidade produtiva medida só pelo time com papel `edicao`.
 */
export default function PosProducao() {
  const { canSeeMoney } = usePermissions();

  const { data: projetos = [] } = useQuery({
    queryKey: ["pos-projetos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("projects_v")
        .select("id, numero, name, client_name, status, edicao_horas_vendidas, edicao_horas_mapeadas, sold_value")
        .neq("status", "faturado")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: editores = [] } = useQuery({
    queryKey: ["pos-editores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id").eq("role", "edicao");
      if (error) throw error;
      return data;
    },
  });

  const editoresIds = useMemo(() => editores.map((e) => e.user_id), [editores]);

  // Realizado por projeto (soma de horas apontadas por editores) — Onda 4 traz de verdade.
  // Enquanto Horas não existe, mostramos "—".
  const realizadoPorProjeto: Record<string, number> = {};

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Clapperboard className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Pós-Produção</h1>
          <p className="text-sm text-muted-foreground">
            Capacidade do time de edição e esforço por projeto. <strong>Disponível</strong> conta só
            quem tem a tag <strong>Edição</strong>; todo mundo aponta horas, mas a capacidade produtiva
            do pós é medida só pela equipe de edição.
          </p>
        </div>
      </div>

      {editoresIds.length === 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            <p>
              Ninguém tem a tag <strong>Edição</strong> ainda. Em{" "}
              <Link to="/time" className="text-primary hover:underline">
                Time
              </Link>
              , marque o time de pós como <strong>Edição</strong> pra esta análise ganhar vida.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Fila de edição
        </p>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
          {projetos.length} projetos
        </span>
        <p className="text-xs text-muted-foreground">
          orçado × mapeado × realizado (horas)
        </p>
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="grid grid-cols-[80px_1.2fr_140px_100px_100px_100px_100px_100px_40px] items-center gap-2 border-b border-border/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>#</span>
            <span>Projeto</span>
            <span>Etapa</span>
            <span className="text-right">Cobrado</span>
            <span className="text-right">Vendidas</span>
            <span className="text-right">Mapeado</span>
            <span className="text-right">Realizado</span>
            <span className="text-right">Custo Time</span>
            <span />
          </div>
          {projetos.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum projeto na fila.
            </div>
          ) : (
            projetos.map((p) => {
              const realizado = realizadoPorProjeto[p.id];
              const vendidas = p.edicao_horas_vendidas;
              const mapeadas = p.edicao_horas_mapeadas;
              const alerta = realizado != null && vendidas != null && realizado > vendidas;
              return (
                <Link
                  key={p.id}
                  to={`/projetos/${p.id}`}
                  className="grid grid-cols-[80px_1.2fr_140px_100px_100px_100px_100px_100px_40px] items-center gap-2 border-b border-border/40 px-5 py-3 text-sm last:border-0 hover:bg-sidebar-accent/40"
                >
                  <span className="font-mono text-xs text-muted-foreground">{p.numero || "—"}</span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.client_name || "—"}</p>
                  </div>
                  <span className="rounded-md bg-muted/40 px-2 py-0.5 text-center text-[10px] text-muted-foreground">
                    {p.status}
                  </span>
                  <span className="text-right text-xs">
                    {canSeeMoney ? formatCurrency(p.sold_value || 0) : "—"}
                  </span>
                  <span className="text-right text-xs">{vendidas != null ? `${vendidas}h` : "—"}</span>
                  <span className="text-right text-xs">{mapeadas != null ? `${mapeadas}h` : "—"}</span>
                  <span className={`text-right text-xs ${alerta ? "text-destructive" : ""}`}>
                    {realizado != null ? `${realizado}h` : "—"}
                  </span>
                  <span className="text-right text-xs text-muted-foreground">—</span>
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">
        <strong>Vendidas</strong> = horas de pós vendidas (definidas no projeto ou puxadas da planilha) ·{" "}
        <strong>Mapeado</strong> = estimativas das tarefas · <strong>Realizado</strong> = horas do time
        de Edição. Vermelho = realizado passou do vendido. Clique num projeto pra ver o time por tarefa.
      </p>
    </div>
  );
}
