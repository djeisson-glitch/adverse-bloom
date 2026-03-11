import { useMemo } from "react";
import { AlertTriangle, TrendingUp, Lightbulb, BarChart3, Percent } from "lucide-react";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { formatCurrency, formatPercent } from "@/lib/format";
import { motion } from "framer-motion";
import { StatCard } from "@/components/StatCard";

interface CAItem {
  total?: number;
  pago?: number;
  status?: string;
  data_vencimento?: string;
  data_competencia?: string;
  categorias?: { nome?: string }[];
  cliente?: { nome?: string };
}

const FIXED_KEYWORDS = ["fixo", "aluguel", "salário", "salario", "contador", "pro-labore", "pró-labore", "internet", "telefone", "software", "assinatura"];
const META_TICKET = 50000;

export default function Insights() {
  const { receivables, payables } = useAllContaAzulCache();

  const recItems = useMemo(() => extractItems<CAItem>(receivables.data?.payload), [receivables.data]);
  const payItems = useMemo(() => extractItems<CAItem>(payables.data?.payload), [payables.data]);

  const now = new Date();
  const currentYear = now.getFullYear();

  // Year-to-date items
  const recYTD = useMemo(() => recItems.filter(r => r?.data_vencimento?.startsWith(String(currentYear))), [recItems, currentYear]);
  const payYTD = useMemo(() => payItems.filter(r => r?.data_vencimento?.startsWith(String(currentYear))), [payItems, currentYear]);

  const receitaTotal = recYTD.reduce((s, r) => s + (r?.total ?? 0), 0);
  const despesasTotal = payYTD.reduce((s, r) => s + (r?.total ?? 0), 0);
  const lucroLiquido = receitaTotal - despesasTotal;
  const margemLiquida = receitaTotal > 0 ? (lucroLiquido / receitaTotal) * 100 : 0;

  // Fixed vs Variable
  const { custosFixos, custosVariaveis, fixosPorCat, variaveisPorCat } = useMemo(() => {
    let fixos = 0, variaveis = 0;
    const fixCat: Record<string, number> = {};
    const varCat: Record<string, number> = {};
    payYTD.forEach(item => {
      const catName = item?.categorias?.[0]?.nome || "Outros";
      const catLower = catName.toLowerCase();
      const val = item?.total ?? 0;
      if (FIXED_KEYWORDS.some(k => catLower.includes(k))) {
        fixos += val;
        fixCat[catName] = (fixCat[catName] || 0) + val;
      } else {
        variaveis += val;
        varCat[catName] = (varCat[catName] || 0) + val;
      }
    });
    return {
      custosFixos: fixos,
      custosVariaveis: variaveis,
      fixosPorCat: Object.entries(fixCat).sort((a, b) => b[1] - a[1]),
      variaveisPorCat: Object.entries(varCat).sort((a, b) => b[1] - a[1]),
    };
  }, [payYTD]);

  const margemContribuicao = receitaTotal > 0 ? ((receitaTotal - custosVariaveis) / receitaTotal) * 100 : 0;
  const ticketMedio = recYTD.length > 0 ? receitaTotal / recYTD.length : 0;

  // Revenue concentration
  const topClientConcentration = useMemo(() => {
    const byClient: Record<string, number> = {};
    recYTD.forEach(item => {
      const name = item?.cliente?.nome || "Sem cliente";
      byClient[name] = (byClient[name] || 0) + (item?.total ?? 0);
    });
    const sorted = Object.values(byClient).sort((a, b) => b - a);
    const top3 = sorted.slice(0, 3).reduce((s, v) => s + v, 0);
    return receitaTotal > 0 ? (top3 / receitaTotal) * 100 : 0;
  }, [recYTD, receitaTotal]);

  // Monthly margins for checking negative
  const monthlyMargins = useMemo(() => {
    const results: { month: string; margem: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const key = `${currentYear}-${String(m + 1).padStart(2, "0")}`;
      const rec = recItems.filter(r => r?.data_vencimento?.startsWith(key)).reduce((s, r) => s + (r?.total ?? 0), 0);
      const desp = payItems.filter(r => r?.data_vencimento?.startsWith(key)).reduce((s, r) => s + (r?.total ?? 0), 0);
      if (rec > 0 || desp > 0) {
        const margem = rec > 0 ? ((rec - desp) / rec) * 100 : -100;
        const label = new Date(currentYear, m, 1).toLocaleDateString("pt-BR", { month: "long" });
        results.push({ month: label, margem });
      }
    }
    return results;
  }, [recItems, payItems, currentYear]);

  const negativeMarginsMonths = monthlyMargins.filter(m => m.margem < 0);
  const fixosPctReceita = receitaTotal > 0 ? (custosFixos / receitaTotal) * 100 : 0;

  // Growth: last 6 vs previous 6
  const { recentRev, previousRev } = useMemo(() => {
    let recent = 0, prev = 0;
    for (let i = 0; i < 6; i++) {
      const d1 = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k1 = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, "0")}`;
      recent += recItems.filter(r => r?.data_vencimento?.startsWith(k1)).reduce((s, r) => s + (r?.total ?? 0), 0);
      const d2 = new Date(now.getFullYear(), now.getMonth() - 6 - i, 1);
      const k2 = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}`;
      prev += recItems.filter(r => r?.data_vencimento?.startsWith(k2)).reduce((s, r) => s + (r?.total ?? 0), 0);
    }
    return { recentRev: recent, previousRev: prev };
  }, [recItems]);

  const growthPct = previousRev > 0 ? ((recentRev - previousRev) / previousRev) * 100 : 0;

  // Best month ever
  const bestMonth = useMemo(() => {
    const byMonth: Record<string, number> = {};
    recItems.forEach(r => {
      const key = r?.data_vencimento?.slice(0, 7);
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
          {/* Dynamic Banner */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5 border-l-4 border-l-primary">
            <p className="text-sm font-medium">{bannerText}</p>
          </motion.div>

          {/* Margin Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title="Margem de Contribuição" value={formatPercent(margemContribuicao)} icon={BarChart3} delay={0} />
            <StatCard title="Margem Líquida" value={formatPercent(margemLiquida)} icon={Percent} delay={0.05} />
            <StatCard title="Lucro Líquido" value={formatCurrency(lucroLiquido)} icon={TrendingUp} change={lucroLiquido >= 0 ? "Positivo" : "Negativo"} changeType={lucroLiquido >= 0 ? "positive" : "negative"} delay={0.1} />
          </div>

          {/* Alerts & Opportunities */}
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

          {/* Cost tables */}
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
