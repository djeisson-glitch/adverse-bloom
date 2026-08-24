import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Target, TrendingUp, Wallet, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/format";

/**
 * Metas financeiras — quanto precisamos faturar.
 *
 * O ponto de equilíbrio já existia em lib/financial.ts, mas calculado sobre uma
 * lista hardcoded de categorias do Conta Azul, somando o que já foi PAGO. Isso
 * responde "qual foi o equilíbrio no mês passado", nunca "quanto preciso vender
 * no mês que vem" — e não sabe que parcela de equipamento acaba.
 *
 * Aqui os números vêm de custos_fixos (com vigência) via calcular_metas(), então
 * o mês futuro é calculado de verdade e o break-even cai sozinho quando a última
 * parcela vence.
 */

type Meta = {
  mes: string;
  estrutura: number;
  pessoa: number;
  divida: number;
  parcela: number;
  imposto_atrasado: number;
  retirada: number;
  custo_sem_retirada: number;
  margem_contribuicao: number;
  piso: number;
  break_even: number;
  meta: number;
};

const mesCurto = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

export default function MetasFinanceiras() {
  const { canSeeMoney } = usePermissions();
  const [idx, setIdx] = useState(0);
  const [faturamento, setFaturamento] = useState<number>(45000);

  const { data: metas = [], isLoading } = useQuery({
    queryKey: ["metas-12m"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("metas_12m")
        .select("*")
        .order("mes");
      if (error) throw error;
      return (data ?? []) as Meta[];
    },
    enabled: canSeeMoney,
  });

  const m = metas[idx];

  const situacao = useMemo(() => {
    if (!m) return null;
    const sobra = (faturamento - m.break_even) * Number(m.margem_contribuicao);
    const cache = Math.max(0, sobra / 2);
    if (faturamento >= m.meta - 1)
      return { tom: "ok" as const, titulo: "Meta batida",
        texto: `Você leva ${formatCurrency(m.retirada + cache)} e a reserva recebe ${formatCurrency(cache)}.`, sobra, cache };
    if (faturamento >= m.break_even - 1)
      return { tom: "ok" as const, titulo: "Acima do ponto de equilíbrio",
        texto: `Sobram ${formatCurrency(sobra)}: metade vira cachê, metade vai pra reserva. Faltam ${formatCurrency(m.meta - faturamento)} pra meta.`, sobra, cache };
    if (faturamento >= m.piso - 1)
      return { tom: "atencao" as const, titulo: "Paga a empresa, não paga você",
        texto: `A operação se banca, mas o pró-labore sai do caixa. Faltam ${formatCurrency(m.break_even - faturamento)}.`, sobra, cache: 0 };
    return { tom: "critico" as const, titulo: "Mês consome caixa",
      texto: `Faltam ${formatCurrency(m.piso - faturamento)} só pra empresa se pagar, e ${formatCurrency(m.break_even - faturamento)} pra incluir você.`, sobra, cache: 0 };
  }, [m, faturamento]);

  if (!canSeeMoney) {
    return <div className="p-8 text-muted-foreground">Esta página mostra valores financeiros.</div>;
  }
  if (isLoading) return <div className="p-8 text-muted-foreground">Carregando…</div>;
  if (!metas.length) {
    return (
      <div className="p-8 space-y-2">
        <h1 className="text-2xl font-bold">Metas financeiras</h1>
        <p className="text-muted-foreground">
          Nenhum mês calculado. Cadastre os custos fixos e os parâmetros financeiros para o
          período — sem eles não há ponto de equilíbrio a mostrar.
        </p>
      </div>
    );
  }

  const tomClasse = { ok: "text-emerald-600", atencao: "text-amber-600", critico: "text-red-600" };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Metas financeiras</h1>
        <p className="text-muted-foreground">
          Quanto precisamos faturar, mês a mês. Calculado dos custos com vigência — não do que já foi pago.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Piso da empresa" value={formatCurrency(m.piso)} icon={Wallet}
          change="custo, imposto e parcelas — sem retirada" changeType="neutral" />
        <StatCard title="Ponto de equilíbrio" value={formatCurrency(m.break_even)} icon={Target}
          change="o piso mais o pró-labore" changeType="neutral" delay={0.05} />
        <StatCard title="Meta" value={formatCurrency(m.meta)} icon={TrendingUp}
          change="paga o cachê e enche a reserva" changeType="positive" delay={0.1} />
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mes">Mês</Label>
              <select id="mes" value={idx} onChange={(e) => setIdx(Number(e.target.value))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                {metas.map((x, i) => <option key={x.mes} value={i}>{mesCurto(x.mes)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fat">Faturamento do mês</Label>
              <Input id="fat" type="number" step={1000} min={0} value={faturamento}
                onChange={(e) => setFaturamento(Number(e.target.value) || 0)} />
            </div>
          </div>

          {situacao && (
            <div className="rounded-md border p-4">
              <p className={`font-semibold ${tomClasse[situacao.tom]}`}>{situacao.titulo}</p>
              <p className="text-sm text-muted-foreground mt-1">{situacao.texto}</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            {[
              ["Estrutura", m.estrutura], ["Pessoas", m.pessoa], ["Dívida", m.divida],
              ["Parcelas do mês", m.parcela], ["DAS parcelado", m.imposto_atrasado], ["Pró-labore", m.retirada],
            ].map(([rotulo, valor]) => (
              <div key={rotulo as string} className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</p>
                <p className="font-mono tabular-nums">{formatCurrency(Number(valor))}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Margem de contribuição {(Number(m.margem_contribuicao) * 100).toFixed(1)}% — o que sobra de cada real
            faturado depois do variável de produção e do imposto corrente.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left py-2 pr-4">Mês</th>
                  <th className="text-right py-2 px-4">Parcelas</th>
                  <th className="text-right py-2 px-4">Piso</th>
                  <th className="text-right py-2 px-4">Equilíbrio</th>
                  <th className="text-right py-2 pl-4">Meta</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {metas.map((x, i) => (
                  <tr key={x.mes} onClick={() => setIdx(i)}
                    className={`border-b cursor-pointer hover:bg-muted/50 ${i === idx ? "bg-muted/40" : ""}`}>
                    <td className="py-2 pr-4 font-sans">{mesCurto(x.mes)}</td>
                    <td className="text-right py-2 px-4">{formatCurrency(x.parcela)}</td>
                    <td className="text-right py-2 px-4">{formatCurrency(x.piso)}</td>
                    <td className="text-right py-2 px-4 font-semibold">{formatCurrency(x.break_even)}</td>
                    <td className="text-right py-2 pl-4">{formatCurrency(x.meta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {metas.some((x) => Number(x.divida) > 0) && (
        <div className="flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-muted-foreground">
            O empréstimo está cadastrado <strong className="text-foreground">sem data de fim</strong> — as parcelas
            futuras não estão lançadas no Conta Azul. Assim que souber quantas faltam, preencha a vigência: o ponto de
            equilíbrio cai sozinho a partir do mês seguinte ao fim.
          </p>
        </div>
      )}
    </div>
  );
}
