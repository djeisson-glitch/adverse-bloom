import { useMemo } from "react";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/format";
import { type CAItem, getCat } from "@/lib/financial";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertTriangle, Flame, Rocket, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface Props {
  data2024: number[];
  data2025: number[];
  data2026: number[];
  seasonality: number[];
  metaAnual: number;
  onMetaChange: (v: number) => void;
}

const Q_LABELS = ["Q1 (Jan-Mar)", "Q2 (Abr-Jun)", "Q3 (Jul-Set)", "Q4 (Out-Dez)"];
const Q_MONTHS = [[0,1,2],[3,4,5],[6,7,8],[9,10,11]];
const MONTH_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export function QuarterlyTargets({ data2024, data2025, data2026, seasonality, metaAnual, onMetaChange }: Props) {
  const now = new Date();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
  const currentYear = now.getFullYear();
  const queryClient = useQueryClient();

  // Load targets from DB
  const { data: targetRow } = useQuery({
    queryKey: ["budget-targets", currentYear],
    queryFn: async () => {
      const { data } = await supabase.from("budget_targets").select("*")
        .eq("year", currentYear).maybeSingle();
      return data;
    },
  });

  // Calculate seasonality-based quarterly percents from historical data
  const autoPercents = useMemo(() => {
    const qTotals = Q_MONTHS.map(months =>
      months.reduce((s, m) => s + seasonality[m], 0)
    );
    const total = qTotals.reduce((s, v) => s + v, 0);
    return qTotals.map(v => total > 0 ? (v / total) * 100 : 25);
  }, [seasonality]);

  const qPercents = targetRow
    ? [targetRow.q1_percent, targetRow.q2_percent, targetRow.q3_percent, targetRow.q4_percent]
    : autoPercents;

  // Save/update targets
  const saveMutation = useMutation({
    mutationFn: async (percents: number[]) => {
      const payload = {
        year: currentYear,
        annual_target: metaAnual,
        q1_percent: percents[0],
        q2_percent: percents[1],
        q3_percent: percents[2],
        q4_percent: percents[3],
        auto_calculated: false,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("budget_targets")
        .upsert(payload, { onConflict: "year" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-targets"] });
      toast.success("Metas trimestrais salvas!");
    },
  });

  const recalcAndSave = () => {
    saveMutation.mutate(autoPercents.map(v => Math.round(v * 10) / 10));
  };

  // Quarterly realized values
  const qRealized = Q_MONTHS.map(months =>
    months.reduce((s, m) => s + data2026[m], 0)
  );

  // Peak months from seasonality
  const peakMonths = useMemo(() => {
    const avg = 100 / 12;
    return seasonality.map((s, i) => ({ month: i, pct: s, isPeak: s > avg * 1.3 }));
  }, [seasonality]);

  // Total realized
  const totalRealized = data2026.reduce((s, v) => s + v, 0);
  const totalPct = metaAnual > 0 ? (totalRealized / metaAnual) * 100 : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="font-heading text-lg font-semibold">Metas 2026 — Ajustadas por Sazonalidade</h2>
        <Button variant="outline" size="sm" onClick={recalcAndSave} className="text-xs">
          Recalcular por Sazonalidade
        </Button>
      </div>

      <div className="space-y-4">
        {Q_LABELS.map((label, qi) => {
          const meta = metaAnual * (qPercents[qi] / 100);
          const realized = qRealized[qi];
          const pct = meta > 0 ? (realized / meta) * 100 : 0;
          const gap = realized - meta;
          const isCurrentQ = qi + 1 === currentQuarter;
          const isPastQ = qi + 1 < currentQuarter;
          const isFutureQ = qi + 1 > currentQuarter;
          const qPeaks = Q_MONTHS[qi].filter(m => peakMonths[m]?.isPeak).map(m => MONTH_LABELS[m]);

          return (
            <motion.div
              key={qi}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + qi * 0.08 }}
              className={`p-4 rounded-lg border ${isCurrentQ ? "border-primary/40 bg-primary/5" : "border-border/50 bg-muted/20"}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-semibold text-sm">{label}</span>
                  <Badge variant="outline" className="text-xs">{qPercents[qi].toFixed(0)}%</Badge>
                  {isCurrentQ && <Badge className="text-xs bg-primary/20 text-primary border-primary/30">Atual</Badge>}
                  {qPeaks.length > 0 && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Flame className="h-3 w-3" /> Pico: {qPeaks.join(", ")}
                    </Badge>
                  )}
                </div>
                <span className="font-heading font-bold text-sm">{formatCurrency(meta)}</span>
              </div>

              <div className="mb-2">
                <Progress value={Math.min(pct, 100)} className="h-2.5" />
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {pct >= 100 ? (
                    <span className="flex items-center gap-1 text-success"><CheckCircle className="h-3.5 w-3.5" />{pct.toFixed(0)}%</span>
                  ) : isPastQ ? (
                    <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{pct.toFixed(0)}%</span>
                  ) : (
                    <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
                  )}
                  <span className="text-muted-foreground">Realizado: {formatCurrency(realized)}</span>
                </div>
                <span className={gap >= 0 ? "text-success" : "text-muted-foreground"}>
                  {gap >= 0 ? `+${formatCurrency(gap)}` : `Gap: ${formatCurrency(Math.abs(gap))}`}
                </span>
              </div>

              {isCurrentQ && qPeaks.length > 0 && (
                <p className="text-xs text-warning mt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {qPeaks.join(" e ")} {qPeaks.length > 1 ? "são meses" : "é mês"} de pico — Intensificar comercial!
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Annual performance bar */}
      <div className="p-4 rounded-lg border border-border/50 bg-muted/10">
        <div className="flex items-center justify-between mb-2">
          <span className="font-heading font-semibold text-sm flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4" /> Performance Anual
          </span>
          <span className="text-sm font-bold">{totalPct.toFixed(0)}%</span>
        </div>
        <Progress value={Math.min(totalPct, 100)} className="h-3" />
        <p className="text-xs text-muted-foreground mt-2">
          {formatCurrency(totalRealized)} de {formatCurrency(metaAnual)}
        </p>
      </div>
    </motion.div>
  );
}
