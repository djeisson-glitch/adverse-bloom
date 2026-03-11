import { useMemo } from "react";
import { Stethoscope, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  type CAItem, isInRange, getCat, isExcluded,
  calcReceitaTotal, monthKey, monthlyReceitaTotal,
} from "@/lib/financial";
import type { PeriodRange } from "@/components/PeriodFilter";

interface Props {
  recItems: CAItem[];
  payItems: CAItem[];
  period: PeriodRange;
  receitaTotal: number;
  custosFixos: number;
  custosVariaveis: number;
  lucroLiquido: number;
  margemLiquida: number;
}

type DiagnosisType =
  | "RECEITA INSUFICIENTE"
  | "CUSTOS FIXOS ELEVADOS"
  | "CUSTO VARIÁVEL ALTO"
  | "CONCENTRAÇÃO DE CLIENTES"
  | "RESULTADO SAUDÁVEL";

const diagnosisConfig: Record<DiagnosisType, { color: string; badge: "destructive" | "default" | "secondary"; bg: string }> = {
  "RECEITA INSUFICIENTE": { color: "text-destructive", badge: "destructive", bg: "bg-destructive/10 border-destructive/30" },
  "CUSTOS FIXOS ELEVADOS": { color: "text-destructive", badge: "destructive", bg: "bg-destructive/10 border-destructive/30" },
  "CUSTO VARIÁVEL ALTO": { color: "text-warning", badge: "default", bg: "bg-warning/10 border-warning/30" },
  "CONCENTRAÇÃO DE CLIENTES": { color: "text-warning", badge: "default", bg: "bg-warning/10 border-warning/30" },
  "RESULTADO SAUDÁVEL": { color: "text-success", badge: "secondary", bg: "bg-success/10 border-success/30" },
};

export function DiagnosticoResultado({
  recItems, payItems, period,
  receitaTotal, custosFixos, custosVariaveis, lucroLiquido, margemLiquida,
}: Props) {
  const custosFixosPct = receitaTotal > 0 ? (custosFixos / receitaTotal) * 100 : 0;
  const custosVariaveisPct = receitaTotal > 0 ? (custosVariaveis / receitaTotal) * 100 : 0;
  const lucroPct = receitaTotal > 0 ? (lucroLiquido / receitaTotal) * 100 : 0;

  // Top 1 client concentration
  const top1ClientPct = useMemo(() => {
    const recFiltered = recItems.filter(r => isInRange(r?.data_competencia, period));
    const byClient: Record<string, number> = {};
    recFiltered.forEach(item => {
      const name = item?.cliente?.nome || "Sem cliente";
      byClient[name] = (byClient[name] || 0) + (item?.total ?? 0);
    });
    const sorted = Object.values(byClient).sort((a, b) => b - a);
    return receitaTotal > 0 && sorted.length > 0 ? (sorted[0] / receitaTotal) * 100 : 0;
  }, [recItems, receitaTotal, period]);

  // Top 3 cost categories
  const topCategorias = useMemo(() => {
    const filtered = payItems.filter(p => !isExcluded(p) && isInRange(p?.data_competencia, period));
    const byCat: Record<string, number> = {};
    filtered.forEach(item => {
      const cat = getCat(item);
      byCat[cat] = (byCat[cat] || 0) + (item?.total ?? 0);
    });
    return Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [payItems, period]);

  // Previous period revenue comparison
  const { receitaAnterior, deltaLabel } = useMemo(() => {
    const fromDate = new Date(period.from + "T00:00:00");
    const toDate = new Date(period.to + "T00:00:00");
    const durationMs = toDate.getTime() - fromDate.getTime();
    const prevFrom = new Date(fromDate.getTime() - durationMs - 86400000);
    const prevTo = new Date(fromDate.getTime() - 86400000);
    const prevPeriod: PeriodRange = {
      from: prevFrom.toISOString().slice(0, 10),
      to: prevTo.toISOString().slice(0, 10),
    };
    const prev = calcReceitaTotal(recItems, prevPeriod);
    return { receitaAnterior: prev, deltaLabel: "período anterior" };
  }, [recItems, period]);

  const revenueDelta = receitaAnterior > 0
    ? ((receitaTotal - receitaAnterior) / receitaAnterior) * 100
    : 0;

  // Determine diagnosis
  const diagnosis: DiagnosisType = useMemo(() => {
    if (margemLiquida > 15) return "RESULTADO SAUDÁVEL";
    if (receitaTotal < custosFixos * 2) return "RECEITA INSUFICIENTE";
    if (custosFixosPct > 45) return "CUSTOS FIXOS ELEVADOS";
    if (custosVariaveisPct > 40) return "CUSTO VARIÁVEL ALTO";
    if (top1ClientPct > 40) return "CONCENTRAÇÃO DE CLIENTES";
    return "RESULTADO SAUDÁVEL";
  }, [margemLiquida, receitaTotal, custosFixos, custosFixosPct, custosVariaveisPct, top1ClientPct]);

  const config = diagnosisConfig[diagnosis];

  const explanation = useMemo(() => {
    switch (diagnosis) {
      case "RECEITA INSUFICIENTE":
        return `A receita do período (${formatCurrency(receitaTotal)}) não é suficiente para cobrir a estrutura de custos fixos (${formatCurrency(custosFixos)}). O faturamento precisa ser pelo menos o dobro dos custos fixos para gerar margem saudável.`;
      case "CUSTOS FIXOS ELEVADOS":
        return `Os custos fixos representam ${formatPercent(custosFixosPct)} da receita, acima do limite saudável de 45%. A estrutura fixa está comprimindo a margem líquida, que ficou em ${formatPercent(margemLiquida)}.`;
      case "CUSTO VARIÁVEL ALTO":
        return `Os custos variáveis consomem ${formatPercent(custosVariaveisPct)} da receita. Isso reduz a margem de contribuição e limita o lucro disponível para cobrir custos fixos.`;
      case "CONCENTRAÇÃO DE CLIENTES":
        return `Um único cliente representa ${formatPercent(top1ClientPct)} da receita, criando dependência excessiva. A perda deste cliente impactaria severamente o resultado.`;
      case "RESULTADO SAUDÁVEL":
        return `A margem líquida de ${formatPercent(margemLiquida)} indica boa saúde financeira. A estrutura de custos está equilibrada em relação à receita gerada.`;
    }
  }, [diagnosis, receitaTotal, custosFixos, custosFixosPct, custosVariaveisPct, margemLiquida, top1ClientPct]);

  // Bar widths (relative to revenue)
  const fixosBar = Math.min(custosFixosPct, 100);
  const variaveisBar = Math.min(custosVariaveisPct, 100);
  const lucroBar = Math.max(Math.min(lucroPct, 100), 0);

  if (receitaTotal === 0 && custosFixos === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" /> Diagnóstico do Resultado
        </h2>
        <Badge variant={config.badge} className="text-xs">{diagnosis}</Badge>
      </div>

      <p className="text-sm text-muted-foreground mb-5">{explanation}</p>

      {/* Cost breakdown bar */}
      <div className="mb-5">
        <p className="text-xs text-muted-foreground mb-2 font-medium">Composição da Receita</p>
        <div className="h-6 rounded-md overflow-hidden flex bg-muted/30 border border-border/50">
          {fixosBar > 0 && (
            <div
              className="h-full bg-destructive/70 flex items-center justify-center text-[10px] font-medium text-destructive-foreground transition-all"
              style={{ width: `${fixosBar}%` }}
              title={`Fixos: ${formatPercent(custosFixosPct)}`}
            >
              {fixosBar > 12 && `Fixos ${formatPercent(custosFixosPct)}`}
            </div>
          )}
          {variaveisBar > 0 && (
            <div
              className="h-full bg-warning/70 flex items-center justify-center text-[10px] font-medium text-warning-foreground transition-all"
              style={{ width: `${variaveisBar}%` }}
              title={`Variáveis: ${formatPercent(custosVariaveisPct)}`}
            >
              {variaveisBar > 12 && `Var. ${formatPercent(custosVariaveisPct)}`}
            </div>
          )}
          {lucroBar > 0 && (
            <div
              className="h-full bg-success/70 flex items-center justify-center text-[10px] font-medium text-success-foreground transition-all"
              style={{ width: `${lucroBar}%` }}
              title={`Lucro: ${formatPercent(lucroPct)}`}
            >
              {lucroBar > 12 && `Lucro ${formatPercent(lucroPct)}`}
            </div>
          )}
        </div>
        <div className="flex gap-4 mt-1.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-destructive/70 inline-block" /> Fixos</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-warning/70 inline-block" /> Variáveis</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-success/70 inline-block" /> Lucro</span>
        </div>
      </div>

      {/* Top 3 cost categories */}
      {topCategorias.length > 0 && (
        <div className="mb-5">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Top 3 Categorias de Custo</p>
          <div className="space-y-1.5">
            {topCategorias.map(([cat, val], i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground truncate mr-3">{cat}</span>
                <span className="shrink-0 font-medium">
                  {formatCurrency(val)}
                  <span className="text-muted-foreground text-xs ml-1">
                    ({receitaTotal > 0 ? formatPercent((val / receitaTotal) * 100) : "0%"})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* vs previous period */}
      {receitaAnterior > 0 && (
        <div className="flex items-center gap-2 text-sm border-t border-border/50 pt-3">
          <span className="text-muted-foreground">vs {deltaLabel}:</span>
          <span className={`flex items-center gap-1 font-medium ${revenueDelta >= 0 ? "text-success" : "text-destructive"}`}>
            {revenueDelta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {revenueDelta >= 0 ? "+" : ""}{formatPercent(revenueDelta)}
          </span>
          <span className="text-muted-foreground text-xs">
            ({formatCurrency(receitaAnterior)} <ArrowRight className="h-3 w-3 inline" /> {formatCurrency(receitaTotal)})
          </span>
        </div>
      )}
    </motion.div>
  );
}
