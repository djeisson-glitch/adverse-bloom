import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Scale, Lock, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { Link } from "react-router-dom";
import { toast } from "sonner";

type Row = {
  project_id: string;
  numero: string | null;
  name: string;
  client_name: string | null;
  status: string;
  horas: number;
  valor: number;
  custos_externos: number;
  custo_interno: number;
  custo_total: number;
  margem: number;
  margem_percent: number | null;
};

type Closure = { project_id: string; closed_at: string };

export default function Fechamento() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { canSeeMoney } = usePermissions();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["fechamento"],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_rentabilidade_projeto")
        .select("*")
        .order("status");
      if (error) throw error;
      return data as Row[];
    },
  });

  const { data: closures = [] } = useQuery({
    queryKey: ["fechamento-closures"],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("project_closures").select("project_id, closed_at");
      if (error) throw error;
      return data as Closure[];
    },
  });

  const closuresMap = new Map(closures.map((c) => [c.project_id, c]));

  const finalizar = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await (supabase as any).from("project_closures").insert({
        project_id: row.project_id,
        closed_by: user?.id || null,
        horas_totais: row.horas,
        custo_interno: row.custo_interno,
        custos_externos: row.custos_externos,
        custo_total: row.custo_total,
        valor_total: row.valor,
        margem_final: row.margem,
        margem_percent: row.margem_percent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fechamento-closures"] });
      toast.success("Fechamento finalizado (snapshot gravado)");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  if (!canSeeMoney) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-sm text-muted-foreground">
        Só admin e produtor têm acesso ao Fechamento.
      </div>
    );
  }

  const abertos = rows.filter((r) => r.status !== "faturado");
  const fechados = rows.filter((r) => r.status === "faturado" || closuresMap.has(r.project_id));

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Scale className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Fechamento</h1>
          <p className="text-sm text-muted-foreground">
            Visão por projeto: <strong>horas</strong>, <strong>custos</strong>, <strong>valor</strong> e{" "}
            <strong>margem</strong>. Enquanto está em <em>previsão</em> (cinza), os números são estimados;
            ao finalizar, a linha fica <span className="text-success">verde</span> e os valores viram
            definitivos.
          </p>
        </div>
      </div>

      <FechamentoTabela title="Em previsão" rows={abertos} closuresMap={closuresMap} onFinalizar={(r) => finalizar.mutate(r)} isLoading={isLoading} definitivo={false} />
      {fechados.length > 0 && (
        <FechamentoTabela title="Fechados" rows={fechados} closuresMap={closuresMap} onFinalizar={() => {}} isLoading={false} definitivo />
      )}

      <p className="text-xs text-muted-foreground">
        <strong>Custos totais</strong> = horas × custo/hora do apontador + custos externos. <strong>Margem final</strong> = valor − custos totais.
        Abra um projeto pra lançar horas e finalizar o fechamento.
      </p>
    </div>
  );
}

function FechamentoTabela({
  title,
  rows,
  closuresMap,
  onFinalizar,
  isLoading,
  definitivo,
}: {
  title: string;
  rows: Row[];
  closuresMap: Map<string, Closure>;
  onFinalizar: (r: Row) => void;
  isLoading: boolean;
  definitivo: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        {title} <span className="text-muted-foreground">({rows.length})</span>
      </p>
      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="grid grid-cols-[80px_1fr_120px_80px_120px_120px_100px_100px] items-center gap-2 border-b border-border/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>#</span>
            <span>Projeto</span>
            <span>Estado</span>
            <span className="text-right">Horas</span>
            <span className="text-right">Custos</span>
            <span className="text-right">Valor</span>
            <span className="text-right">Margem</span>
            <span />
          </div>
          {isLoading ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nada aqui.</div>
          ) : (
            rows.map((r) => {
              const fechado = definitivo || closuresMap.has(r.project_id);
              return (
                <div
                  key={r.project_id}
                  className={`grid grid-cols-[80px_1fr_120px_80px_120px_120px_100px_100px] items-center gap-2 border-b border-border/40 px-5 py-3 last:border-0 ${
                    fechado ? "bg-success/5" : ""
                  }`}
                >
                  <span className="font-mono text-xs text-muted-foreground">{r.numero || "—"}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.client_name || "—"}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs ${fechado ? "text-success" : "text-muted-foreground"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${fechado ? "bg-success" : "bg-muted-foreground"}`} />
                    {fechado ? "Fechado" : "Em previsão"}
                  </span>
                  <span className="text-right text-xs">{Number(r.horas || 0).toFixed(1)}h</span>
                  <span className="text-right text-xs">{formatCurrency(r.custo_total || 0)}</span>
                  <span className="text-right text-sm text-foreground">{formatCurrency(r.valor || 0)}</span>
                  <span className={`text-right text-sm font-medium ${r.margem >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(r.margem || 0)}
                    {r.margem_percent != null && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {Number(r.margem_percent).toFixed(0)}%
                      </span>
                    )}
                  </span>
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      to={`/projetos/${r.project_id}`}
                      className="text-muted-foreground hover:text-primary"
                      title="Abrir projeto"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                    {!fechado && (
                      <Button size="sm" variant="outline" className="h-7" onClick={() => onFinalizar(r)}>
                        <Lock className="mr-1 h-3 w-3" />
                        Finalizar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
