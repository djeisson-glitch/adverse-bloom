import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CalendarClock, Link2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { CustosLinhas, somaCustos, type ItemCusto } from "./CustosLinhas";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { toast } from "sonner";

type Diaria = {
  id: string; data: string; local: string | null; fracao: number;
  custo_logistica: number; custo_alimentacao: number; custo_hospedagem: number;
  custos_itens?: ItemCusto[] | null;
};

/**
 * Diárias no fechamento do projeto — onde os custos do dia são LANÇADOS.
 *
 * Os campos ficam aqui, e não só no agendamento, porque na hora de marcar a
 * diária ninguém sabe quanto vai custar o combustível. Fechar o projeto é
 * justamente o momento em que as notas estão na mesa.
 *
 * Logística, alimentação e hospedagem são REPASSE, não trabalho: levam margem
 * própria (15% por padrão, menor que a de produção) e o imposto do cliente por
 * cima. Cliente com tabela de preço final não leva imposto, como no resto da
 * conta.
 *
 * O aviso de dia compartilhado existe porque a mesma saída pode servir a dois
 * projetos do mesmo cliente. Na cobrança do mês conta UMA diária — mas custo
 * lançado nos dois viraria repasse dobrado.
 */
export function DiariasFechamento({ projectId, clientId }: { projectId: string; clientId?: string | null }) {
  const qc = useQueryClient();

  const { data: diarias = [] } = useQuery({
    queryKey: ["fechamento-diarias", projectId],
    queryFn: async () =>
      ((await (supabase as any).from("producao_saidas")
        .select("*").eq("project_id", projectId).eq("tipo", "diaria")
        .neq("status", "cancelada").order("data")).data || []) as Diaria[],
  });

  const { data: porDia = [] } = useQuery({
    queryKey: ["fechamento-diarias-cliente", clientId],
    enabled: !!clientId,
    queryFn: async () =>
      (await (supabase as any).from("diarias_por_dia").select("*").eq("client_id", clientId)).data || [],
  });

  const { data: cfg } = useQuery({
    queryKey: ["fechamento-cfg", clientId],
    enabled: !!clientId,
    queryFn: async () =>
      (await (supabase as any).from("client_faturamento")
        .select("margem_diaria_percent, imposto_percent, precos_finais")
        .eq("client_id", clientId).maybeSingle()).data,
  });

  // Rascunho local: o que está sendo digitado. Sem isso, o refetch da query
  // apaga o número no meio da digitação.
  const [rascunho, setRascunho] = useState<Record<string, Partial<Diaria>>>({});
  useEffect(() => { setRascunho({}); }, [projectId]);

  const salvar = useFormAutosave<{ id: string } & Partial<Diaria>>(async ({ id, ...patch }) => {
    const { data, error } = await (supabase as any)
      .from("producao_saidas").update(patch).eq("id", id).select("id");
    if (error) { toast.error("Não salvou o custo", { description: error.message }); throw error; }
    if (!data?.length) { toast.error("Não salvou — sem permissão nesta diária?"); throw new Error("rls"); }
    qc.invalidateQueries({ queryKey: ["fechamento-diarias", projectId] });
    qc.invalidateQueries({ queryKey: ["fechamento-diarias-cliente", clientId] });
    qc.invalidateQueries({ queryKey: ["projeto-diarias", projectId] });
  });

  if (diarias.length === 0) return null;

  const margem = Number(cfg?.margem_diaria_percent ?? 15);
  const imposto = cfg?.precos_finais ? 0 : Number(cfg?.imposto_percent ?? 0);
  const repasseDe = (custo: number) => custo * (1 + margem / 100) * (1 + imposto / 100);

  const compartilhado = (iso: string) => {
    const d = (porDia as any[]).find((x) => x.data === iso);
    return d && d.projetos > 1;
  };

  /** Linhas em edição (rascunho) ou as que vieram do banco. */
  const linhasDe = (d: Diaria): ItemCusto[] =>
    (rascunho[d.id]?.custos_itens as ItemCusto[] | undefined) ?? (d.custos_itens || []);

  const mudarLinhas = (d: Diaria, novas: ItemCusto[]) => {
    setRascunho((r) => ({ ...r, [d.id]: { ...r[d.id], custos_itens: novas as any } }));
    // Só as linhas vão pro banco: o trigger refaz os três totais a partir
    // delas. Mandar total junto seria abrir espaço pra divergirem.
    salvar.agendar({ id: d.id, custos_itens: novas.filter((c) => c.descricao.trim() || c.valor) } as any);
  };

  const custoDe = (d: Diaria) => somaCustos(linhasDe(d));

  const custoTotal = diarias.reduce((s, d) => s + custoDe(d), 0);
  const repasseTotal = diarias.reduce((s, d) => s + repasseDe(custoDe(d)), 0);
  const contadas = diarias.reduce((s, d) => s + Number(d.fracao ?? 1), 0);

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-warning" />
            <p className="text-sm font-semibold text-foreground">Diárias e custos de campo</p>
          </div>
          <span className="text-xs text-muted-foreground">
            {String(contadas).replace(".", ",")} diária{contadas === 1 ? "" : "s"} neste projeto
          </span>
        </div>

        {diarias.map((d) => {
          const custo = custoDe(d);
          return (
            <div key={d.id} className="space-y-2 rounded-lg border border-border/50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-foreground">
                  {d.data.slice(8, 10)}/{d.data.slice(5, 7)}/{d.data.slice(2, 4)}
                </span>
                {d.local && <span className="text-muted-foreground">· {d.local}</span>}
                {Number(d.fracao ?? 1) < 1 && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-warning">meia diária</span>
                )}
                {compartilhado(d.data) && (
                  <span className="inline-flex items-center gap-1 text-warning" title="outro projeto deste cliente gravou no mesmo dia — na cobrança conta uma diária só">
                    <Link2 className="h-3 w-3" /> dia compartilhado
                  </span>
                )}
                {custo > 0 && (
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {formatCurrency(custo)} → <b className="text-foreground">{formatCurrency(repasseDe(custo))}</b>
                  </span>
                )}
              </div>

              {/* Linha a linha: é aqui que as notas do dia chegam, e somar
                  três recibos de cabeça pra escrever um total só é onde o
                  erro entra — e onde a origem do número se perde. */}
              <CustosLinhas itens={linhasDe(d)} onChange={(novas) => mudarLinhas(d, novas)} compacto />
            </div>
          );
        })}

        {custoTotal > 0 && (
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border/40 pt-2 text-xs">
            <span className="text-muted-foreground">
              Custo {formatCurrency(custoTotal)} → repasse com margem {margem}%
              {imposto > 0 ? ` + imposto ${imposto}%` : ""}
            </span>
            <span className="text-sm font-semibold text-foreground">{formatCurrency(repasseTotal)}</span>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Lance aqui as notas do dia: fechar o projeto é quando elas estão na mesa — na hora de
          agendar ninguém sabe quanto vai custar o combustível. Salva sozinho.
          {diarias.some((d) => compartilhado(d.data)) && (
            <> Em dia compartilhado, lance o custo em <b>um projeto só</b>: a saída foi uma.</>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
