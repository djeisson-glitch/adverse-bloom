import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Lock, ChevronRight, ChevronDown, Search, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useConfirm } from "@/components/ui/confirm";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { listaDoProjeto } from "@/lib/fechamentoFila";

/**
 * Fechamento de projetos.
 *
 * A tela anterior mostrava TODO projeto que não estava "faturado" numa lista
 * só — briefing, orçamento, produção, revisão e entregue misturados. Com o
 * acervo importado do ClickUp isso é uma lista de centenas de linhas onde os
 * poucos que precisam de ação ficam invisíveis.
 *
 * Fechar projeto é uma fila, não um relatório: só o que está ENTREGUE e ainda
 * não fechado pede decisão. O que está em produção é acompanhamento, e o que
 * já fechou é arquivo — os dois existem aqui, recolhidos.
 *
 * O que mudou de comportamento, e não só de visual:
 *  · projeto fechado mas não faturado aparecia nas DUAS listas ao mesmo tempo;
 *  · finalizar grava um snapshot permanente e não tinha confirmação nenhuma;
 *  · margem negativa saía em vermelho no meio de dezenas de linhas, sem
 *    nenhum lugar que dissesse "olha, tem três projetos no prejuízo aqui".
 */

type Row = {
  project_id: string; numero: string | null; name: string; client_name: string | null;
  status: string; horas: number; valor: number; custos_externos: number;
  custo_interno: number; custo_total: number; margem: number; margem_percent: number | null;
};
type Closure = { project_id: string; closed_at: string };

export default function Fechamento() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { canSeeMoney } = usePermissions();
  const confirmar = useConfirm();
  const [busca, setBusca] = useState("");
  const [verAndamento, setVerAndamento] = useState(false);
  const [verFechados, setVerFechados] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["fechamento"],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_rentabilidade_projeto").select("*").order("status");
      if (error) throw error;
      return data as Row[];
    },
  });

  const { data: closures = [] } = useQuery({
    queryKey: ["fechamento-closures"],
    enabled: canSeeMoney,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_closures").select("project_id, closed_at");
      if (error) throw error;
      return data as Closure[];
    },
  });

  const fechado = useMemo(() => new Set(closures.map((c) => c.project_id)), [closures]);

  const finalizar = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await (supabase as any).from("project_closures").insert({
        project_id: row.project_id, closed_by: user?.id || null,
        horas_totais: row.horas, custo_interno: row.custo_interno,
        custos_externos: row.custos_externos, custo_total: row.custo_total,
        valor_total: row.valor, margem_final: row.margem, margem_percent: row.margem_percent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fechamento-closures"] });
      toast.success("Fechado. Os números viraram definitivos.");
    },
    onError: (e: any) => toast.error("Não fechou", { description: e.message }),
  });

  const { fila, andamento, arquivo } = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const cabe = (r: Row) => !t ||
      r.name?.toLowerCase().includes(t) ||
      r.client_name?.toLowerCase().includes(t) ||
      String(r.numero ?? "").includes(t);

    // Um projeto pertence a UMA lista só — a regra mora em lib/fechamentoFila.
    const fila: Row[] = [], andamento: Row[] = [], arquivo: Row[] = [];
    for (const r of rows) {
      if (!cabe(r)) continue;
      const l = listaDoProjeto(r.status, fechado.has(r.project_id));
      if (l === "fila") fila.push(r);
      else if (l === "andamento") andamento.push(r);
      else if (l === "arquivo") arquivo.push(r);
    }
    fila.sort((a, b) => (b.valor || 0) - (a.valor || 0));
    return { fila, andamento, arquivo };
  }, [rows, fechado, busca]);

  const resumo = useMemo(() => ({
    margem: fila.reduce((s, r) => s + Number(r.margem || 0), 0),
    valor: fila.reduce((s, r) => s + Number(r.valor || 0), 0),
    negativos: fila.filter((r) => Number(r.margem || 0) < 0).length,
  }), [fila]);

  async function pedirFechamento(r: Row) {
    const ruim = Number(r.margem || 0) < 0;
    const ok = await confirmar({
      title: `Fechar "${r.name}"?`,
      description: (
        <>
          Grava um retrato permanente: {formatCurrency(r.valor || 0)} de valor,{" "}
          {formatCurrency(r.custo_total || 0)} de custo,{" "}
          <strong>{formatCurrency(r.margem || 0)} de margem</strong>. Depois disso os números
          param de acompanhar apontamentos novos.
          {ruim && <> Atenção: este projeto fecha <strong>no prejuízo</strong>.</>}
        </>
      ),
      confirmText: "Fechar projeto",
      destructive: ruim,
    });
    if (ok) finalizar.mutate(r);
  }

  if (!canSeeMoney) {
    return <div className="p-8 text-muted-foreground">Só admin e produtor têm acesso ao Fechamento.</div>;
  }

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Fechamento de projetos</h1>
        <p className="text-muted-foreground">
          Projetos entregues que ainda não tiveram os números congelados.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Numero rotulo="Esperando fechamento" valor={String(fila.length)}
          nota={fila.length === 1 ? "projeto entregue" : "projetos entregues"} />
        <Numero rotulo="Margem a congelar" valor={formatCurrency(resumo.margem)}
          nota={`sobre ${formatCurrency(resumo.valor)} vendidos`}
          tom={resumo.margem < 0 ? "ruim" : "bom"} />
        <Numero rotulo="No prejuízo" valor={String(resumo.negativos)}
          nota={resumo.negativos ? "precisam de olhada antes" : "nenhum"}
          tom={resumo.negativos ? "ruim" : "bom"} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por projeto, cliente ou número" className="pl-9" />
      </div>

      <Tabela titulo="Fila de fechamento" rows={fila} isLoading={isLoading}
        vazio="Nenhum projeto entregue esperando. Fila limpa."
        onFinalizar={pedirFechamento} podeFechar />

      <Recolhivel titulo="Em andamento" n={andamento.length} aberto={verAndamento} alternar={() => setVerAndamento(!verAndamento)}
        nota="ainda produzindo — os números são estimativa e mudam a cada apontamento">
        <Tabela titulo="" rows={andamento} isLoading={false} vazio="Nada em andamento." onFinalizar={pedirFechamento} podeFechar={false} />
      </Recolhivel>

      <Recolhivel titulo="Já fechados" n={arquivo.length} aberto={verFechados} alternar={() => setVerFechados(!verFechados)}
        nota="números congelados">
        <Tabela titulo="" rows={arquivo} isLoading={false} vazio="Nenhum fechado ainda." onFinalizar={pedirFechamento} podeFechar={false} />
      </Recolhivel>

      <p className="text-xs text-muted-foreground">
        Custo total = horas × custo/hora de quem apontou, mais os custos externos do projeto.
        Margem = valor vendido − custo total.
      </p>
    </div>
  );
}

function Numero({ rotulo, valor, nota, tom = "neutro" }: {
  rotulo: string; valor: string; nota?: string; tom?: "neutro" | "bom" | "ruim";
}) {
  const cor = { neutro: "", bom: "text-emerald-600", ruim: "text-red-600" }[tom];
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      <p className={`font-mono tabular-nums text-2xl font-medium mt-0.5 ${cor}`}>{valor}</p>
      {nota && <p className="text-xs text-muted-foreground mt-1">{nota}</p>}
    </div>
  );
}

function Recolhivel({ titulo, n, aberto, alternar, nota, children }: {
  titulo: string; n: number; aberto: boolean; alternar: () => void; nota: string; children: React.ReactNode;
}) {
  return (
    <div>
      <button onClick={alternar} className="flex w-full items-center gap-2 py-2 text-left">
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? "" : "-rotate-90"}`} />
        <span className="text-sm font-medium">{titulo}</span>
        <span className="text-sm text-muted-foreground">({n})</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">— {nota}</span>
      </button>
      {aberto && children}
    </div>
  );
}

function Tabela({ titulo, rows, isLoading, vazio, onFinalizar, podeFechar }: {
  titulo: string; rows: Row[]; isLoading: boolean; vazio: string;
  onFinalizar: (r: Row) => void; podeFechar: boolean;
}) {
  return (
    <div className="space-y-2">
      {titulo && <p className="text-sm font-medium">{titulo} <span className="text-muted-foreground">({rows.length})</span></p>}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">{vazio}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-semibold">Projeto</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Horas</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Custo</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Valor</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Margem</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ruim = Number(r.margem || 0) < 0;
                    return (
                      <tr key={r.project_id} className={`border-b last:border-0 ${ruim ? "bg-red-500/[0.04]" : ""}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            {ruim && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />}
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {r.numero && <span className="font-mono text-xs text-muted-foreground">#{r.numero} </span>}
                                {r.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{r.client_name || "sem cliente"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-xs text-muted-foreground">
                          {Number(r.horas || 0).toFixed(1)}h
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-xs">
                          {formatCurrency(r.custo_total || 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {formatCurrency(r.valor || 0)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono tabular-nums font-medium ${
                          ruim ? "text-red-600" : "text-emerald-600"}`}>
                          {formatCurrency(r.margem || 0)}
                          {r.margem_percent != null && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {Number(r.margem_percent).toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {podeFechar && (
                              <Button size="sm" variant="outline" className="h-7" onClick={() => onFinalizar(r)}>
                                <Lock className="mr-1 h-3 w-3" /> Fechar
                              </Button>
                            )}
                            <Link to={`/projetos/${r.project_id}`} title="Abrir projeto"
                              className="text-muted-foreground hover:text-primary p-1">
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
