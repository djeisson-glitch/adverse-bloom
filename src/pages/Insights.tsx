import { useMemo } from "react";
import { AlertTriangle, TrendingUp, Lightbulb, BarChart3, Percent } from "lucide-react";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { formatCurrency, formatPercent } from "@/lib/format";
import { motion } from "framer-motion";
import { StatCard } from "@/components/StatCard";
import {
  type CAItem, isInRange,
  calcReceitaTotal, calcDespesasOperacionais, calcCustosFixos, calcCustosVariaveis,
  calcMargemContribuicao, calcLucroLiquido, calcTicketMedio,
  calcCustosFixosPorCategoria, calcCustosVariaveisPorCategoria,
  calcBurnRate, calcSaldoEmConta,
  monthKey, monthlyReceitaTotal, monthlyDespesasOp,
} from "@/lib/financial";
import { AiInsightsSection } from "@/components/AiInsightsSection";
import type { PeriodRange } from "@/components/PeriodFilter";

const META_TICKET = 50000;
const META_ANUAL = 1500000;

export default function Insights() {
  const { receivables, payables } = useAllContaAzulCache();

  const recItems = useMemo(() => extractItems<CAItem>(receivables.data?.payload), [receivables.data]);
  const payItems = useMemo(() => extractItems<CAItem>(payables.data?.payload), [payables.data]);

  const now = new Date();
  const currentYear = now.getFullYear();

  // YTD period (competência for receita, vencimento for despesas)
  const ytdPeriod: PeriodRange = { from: `${currentYear}-01-01`, to: `${currentYear}-12-31` };

  const receitaTotal = useMemo(() => calcReceitaTotal(recItems, ytdPeriod), [recItems, currentYear]);
  const despesasOp = useMemo(() => calcDespesasOperacionais(payItems, ytdPeriod), [payItems, currentYear]);
  const custosFixos = useMemo(() => calcCustosFixos(payItems, ytdPeriod), [payItems, currentYear]);
  const custosVariaveis = useMemo(() => calcCustosVariaveis(payItems, ytdPeriod), [payItems, currentYear]);

  const { pct: margemContribuicao } = calcMargemContribuicao(receitaTotal, custosVariaveis);
  const { valor: lucroLiquido, pct: margemLiquida } = calcLucroLiquido(receitaTotal, despesasOp);
  const { valor: ticketMedio, qtde: qtdeProjetos } = calcTicketMedio(recItems, ytdPeriod, receitaTotal);

  const fixosPorCat = useMemo(() => calcCustosFixosPorCategoria(payItems, ytdPeriod), [payItems, currentYear]);
  const variaveisPorCat = useMemo(() => calcCustosVariaveisPorCategoria(payItems, ytdPeriod), [payItems, currentYear]);

  const saldoEmConta = useMemo(() => calcSaldoEmConta(recItems, payItems), [recItems, payItems]);
  const burnRate = useMemo(() => calcBurnRate(payItems), [payItems]);
  const runway = burnRate > 0 ? saldoEmConta / burnRate : 0;

  const mesAtual = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // Revenue concentration (competência)
  const topClientConcentration = useMemo(() => {
    const recFiltered = recItems.filter(r => isInRange(r?.data_competencia, ytdPeriod));
    const byClient: Record<string, number> = {};
    recFiltered.forEach(item => {
      const name = item?.cliente?.nome || "Sem cliente";
      byClient[name] = (byClient[name] || 0) + (item?.total ?? 0);
    });
    const sorted = Object.values(byClient).sort((a, b) => b - a);
    const top3 = sorted.slice(0, 3).reduce((s, v) => s + v, 0);
    return receitaTotal > 0 ? (top3 / receitaTotal) * 100 : 0;
  }, [recItems, receitaTotal, currentYear]);

  // Monthly margins for checking negative (competência for receita, vencimento for despesas)
  const monthlyMargins = useMemo(() => {
    const results: { month: string; margem: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const k = monthKey(currentYear, m);
      const rec = monthlyReceitaTotal(recItems, k);
      const desp = monthlyDespesasOp(payItems, k);
      if (rec > 0 || desp > 0) {
        const lucro = rec - desp;
        const margem = rec > 0 ? (lucro / rec) * 100 : -100;
        const label = new Date(currentYear, m, 1).toLocaleDateString("pt-BR", { month: "long" });
        results.push({ month: label, margem });
      }
    }
    return results;
  }, [recItems, payItems, currentYear]);

  const negativeMarginsMonths = monthlyMargins.filter(m => m.margem < 0);
  const fixosPctReceita = receitaTotal > 0 ? (custosFixos / receitaTotal) * 100 : 0;

  // Growth: last 6 vs previous 6 (competência)
  const { recentRev, previousRev } = useMemo(() => {
    let recent = 0, prev = 0;
    for (let i = 0; i < 6; i++) {
      const d1 = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k1 = monthKey(d1.getFullYear(), d1.getMonth());
      recent += monthlyReceitaTotal(recItems, k1);
      const d2 = new Date(now.getFullYear(), now.getMonth() - 6 - i, 1);
      const k2 = monthKey(d2.getFullYear(), d2.getMonth());
      prev += monthlyReceitaTotal(recItems, k2);
    }
    return { recentRev: recent, previousRev: prev };
  }, [recItems]);

  const growthPct = previousRev > 0 ? ((recentRev - previousRev) / previousRev) * 100 : 0;

  // Best month ever (competência)
  const bestMonth = useMemo(() => {
    const byMonth: Record<string, number> = {};
    recItems.forEach(r => {
      const key = r?.data_competencia?.slice(0, 7);
      if (key) byMonth[key] = (byMonth[key] || 0) + (r?.total ?? 0);
    });
    const sorted = Object.entries(byMonth).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return null;
    const [key, val] = sorted[0];
    const [y, m] = key.split("-");
    const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return { label, value: val };
  }, [recItems]);

  // Alerts
  const alerts: { text: string; severity: "warning" | "critical" }[] = [];
  if (ticketMedio > 0 && ticketMedio < META_TICKET)
    alerts.push({ text: `Ticket médio (${formatCurrency(ticketMedio)}) está abaixo da meta de ${formatCurrency(META_TICKET)}.`, severity: "warning" });
  if (topClientConcentration > 50)
    alerts.push({ text: `Top 3 clientes concentram ${formatPercent(topClientConcentration)} da receita. Risco de dependência.`, severity: "critical" });
  if (fixosPctReceita > 35)
    alerts.push({ text: `Custos fixos representam ${formatPercent(fixosPctReceita)} da receita (ideal < 35%).`, severity: "warning" });
  if (lucroLiquido < 0)
    alerts.push({ text: `Lucro líquido negativo no período: ${formatCurrency(lucroLiquido)}.`, severity: "critical" });
  negativeMarginsMonths.forEach(m =>
    alerts.push({ text: `Margem negativa em ${m.month}: ${formatPercent(m.margem)}.`, severity: "critical" }));

  // Opportunities
  const opportunities: string[] = [];
  if (margemContribuicao > 55) opportunities.push(`Margem de contribuição saudável: ${formatPercent(margemContribuicao)}.`);
  if (growthPct > 0) opportunities.push(`Crescimento de ${formatPercent(growthPct)} nos últimos 6 meses vs anteriores.`);
  if (bestMonth) opportunities.push(`Melhor mês histórico: ${bestMonth.label} com ${formatCurrency(bestMonth.value)}.`);

  // Dynamic banner
  const bannerText = useMemo(() => {
    const parts: string[] = [];
    if (receitaTotal > 0) parts.push(`Receita acumulada de ${formatCurrency(receitaTotal)} no ano`);
    if (lucroLiquido > 0) parts.push(`lucro de ${formatCurrency(lucroLiquido)}`);
    else if (lucroLiquido < 0) parts.push(`prejuízo de ${formatCurrency(Math.abs(lucroLiquido))}`);
    if (margemLiquida !== 0) parts.push(`margem líquida de ${formatPercent(margemLiquida)}`);
    return parts.join(", ") + ".";
  }, [receitaTotal, lucroLiquido, margemLiquida]);

  const hasData = recItems.length > 0 || payItems.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Insights</h1>
        <p className="text-sm text-muted-foreground">Análise inteligente e alertas automáticos — Ano {currentYear}</p>
      </div>

      {!hasData ? (
        <div className="glass-card p-10 text-center text-muted-foreground">Sincronize os dados para visualizar os insights.</div>
      ) : (
        <>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5 border-l-4 border-l-primary">
            <p className="text-sm font-medium">{bannerText}</p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title="Margem de Contribuição" value={formatPercent(margemContribuicao)} icon={BarChart3} delay={0} />
            <StatCard title="Margem Líquida" value={formatPercent(margemLiquida)} icon={Percent} delay={0.05} />
            <StatCard title="Lucro Líquido" value={formatCurrency(lucroLiquido)} icon={TrendingUp} change={lucroLiquido >= 0 ? "Positivo" : "Negativo"} changeType={lucroLiquido >= 0 ? "positive" : "negative"} delay={0.1} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6">
              <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" /> Alertas
              </h2>
              {alerts.length > 0 ? (
                <div className="space-y-3">
                  {alerts.map((a, i) => (
                    <div key={i} className={`p-3 rounded-lg text-sm ${a.severity === "critical" ? "bg-destructive/10 border border-destructive/30 text-destructive" : "bg-warning/10 border border-warning/30 text-warning"}`}>
                      {a.text}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">Nenhum alerta identificado. Tudo em ordem! ✅</p>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6">
              <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-success" /> Oportunidades
              </h2>
              {opportunities.length > 0 ? (
                <div className="space-y-3">
                  {opportunities.map((o, i) => (
                    <div key={i} className="p-3 rounded-lg text-sm bg-success/10 border border-success/30 text-success">
                      {o}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">Continue coletando dados para identificar oportunidades.</p>
              )}
            </motion.div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
              <h2 className="font-heading text-lg font-semibold mb-4">Custos Fixos por Categoria</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Categoria</th>
                      <th className="pb-3 font-medium text-right">Valor</th>
                      <th className="pb-3 font-medium text-right">% dos Fixos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixosPorCat.map(([cat, val], i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2">{cat}</td>
                        <td className="py-2 text-right">{formatCurrency(val)}</td>
                        <td className="py-2 text-right">{custosFixos > 0 ? formatPercent((val / custosFixos) * 100) : "0%"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {fixosPorCat.length === 0 && <p className="text-center text-muted-foreground py-6">Sem custos fixos identificados.</p>}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-6">
              <h2 className="font-heading text-lg font-semibold mb-4">Custos Variáveis por Categoria</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Categoria</th>
                      <th className="pb-3 font-medium text-right">Valor</th>
                      <th className="pb-3 font-medium text-right">% dos Variáveis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variaveisPorCat.map(([cat, val], i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2">{cat}</td>
                        <td className="py-2 text-right">{formatCurrency(val)}</td>
                        <td className="py-2 text-right">{custosVariaveis > 0 ? formatPercent((val / custosVariaveis) * 100) : "0%"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {variaveisPorCat.length === 0 && <p className="text-center text-muted-foreground py-6">Sem custos variáveis identificados.</p>}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
