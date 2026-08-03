import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarClock, Link2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";

/**
 * Diárias no fechamento do projeto — o dia, os custos e o que se repassa.
 *
 * Os custos de diária (logística, alimentação, hospedagem) são REPASSE, não
 * trabalho: levam margem própria de 15%, menor que a de produção, e o
 * imposto do cliente por cima. Cliente com tabela de preço final não leva
 * imposto, como no resto da conta.
 *
 * O aviso de dia compartilhado existe porque a mesma saída pode servir a dois
 * projetos do mesmo cliente. Na cobrança do mês conta UMA diária — mas o
 * custo lançado duas vezes viraria repasse dobrado, e é isso que a marca
 * pega antes de virar fatura.
 */
export function DiariasFechamento({ projectId, clientId }: { projectId: string; clientId?: string | null }) {
  const { data: diarias = [] } = useQuery({
    queryKey: ["fechamento-diarias", projectId],
    queryFn: async () =>
      (await (supabase as any).from("producao_saidas")
        .select("*").eq("project_id", projectId).eq("tipo", "diaria")
        .neq("status", "cancelada").order("data")).data || [],
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

  if (diarias.length === 0) return null;

  const margem = Number(cfg?.margem_diaria_percent ?? 15);
  const imposto = cfg?.precos_finais ? 0 : Number(cfg?.imposto_percent ?? 0);
  const repasseDe = (custo: number) => custo * (1 + margem / 100) * (1 + imposto / 100);

  const compartilhado = (iso: string) => {
    const d = (porDia as any[]).find((x) => x.data === iso);
    return d && d.projetos > 1;
  };

  const linhas = (diarias as any[]).map((d) => {
    const custo = Number(d.custo_logistica || 0) + Number(d.custo_alimentacao || 0) + Number(d.custo_hospedagem || 0);
    return { ...d, custo, repasse: repasseDe(custo), shared: compartilhado(d.data) };
  });
  const custoTotal = linhas.reduce((s, l) => s + l.custo, 0);
  const repasseTotal = linhas.reduce((s, l) => s + l.repasse, 0);
  const diariasContadas = linhas.reduce((s, l) => s + Number(l.fracao ?? 1), 0);

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-warning" />
            <p className="text-sm font-semibold text-foreground">Diárias e custos de campo</p>
          </div>
          <span className="text-xs text-muted-foreground">
            {diariasContadas.toString().replace(".", ",")} diária{diariasContadas === 1 ? "" : "s"} neste projeto
          </span>
        </div>

        <div className="space-y-1">
          {linhas.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                {l.data.slice(8, 10)}/{l.data.slice(5, 7)}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {l.local || "sem local"}
                {Number(l.fracao ?? 1) < 1 && <span className="ml-1.5 text-warning">· meia</span>}
              </span>
              {l.shared && (
                <span className="inline-flex shrink-0 items-center gap-1 text-warning" title="outro projeto deste cliente gravou no mesmo dia — na cobrança conta uma diária só">
                  <Link2 className="h-3 w-3" /> dia compartilhado
                </span>
              )}
              <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">
                {l.custo > 0 ? formatCurrency(l.custo) : "—"}
              </span>
              <span className="w-24 shrink-0 text-right tabular-nums text-foreground">
                {l.custo > 0 ? formatCurrency(l.repasse) : "—"}
              </span>
            </div>
          ))}
        </div>

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
          Logística, alimentação e hospedagem são <b>repasse</b>, não trabalho — por isso a margem é
          menor que a de produção.
          {linhas.some((l) => l.shared) && (
            <> Em dia compartilhado, lance o custo em <b>um projeto só</b>: a saída foi uma.</>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
