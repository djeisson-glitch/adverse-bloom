import { useState, useCallback } from "react";
import { Bot, Loader2, Clock, AlertTriangle, Lightbulb, Zap, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AiAlerta {
  titulo: string;
  descricao: string;
  severidade: "alta" | "media" | "baixa";
  impacto: string;
}

interface AiOportunidade {
  titulo: string;
  descricao: string;
  potencial: string;
}

interface AiAcao {
  acao: string;
  prazo: "imediato" | "30 dias" | "90 dias";
  impacto: "alto" | "medio" | "baixo";
}

interface AiInsightsData {
  resumo: string;
  alertas: AiAlerta[];
  oportunidades: AiOportunidade[];
  acoes: AiAcao[];
}

export interface FinancialDataForAi {
  receitaTotal: number;
  receitaRecebida: number;
  despesasOperacionais: number;
  lucroLiquido: number;
  margemLiquida: number;
  margemContribuicao: number;
  custosFixos: number;
  custosVariaveis: number;
  ticketMedio: number;
  saldoEmConta: number;
  burnRate: number;
  runway: number;
  concentracaoReceita: number;
  metaAnual: number;
  receitaAcumulada: number;
  mesAtual: string;
  periodoLabel: string;
}

interface Props {
  financialData: FinancialDataForAi;
  hasData: boolean;
}

const severidadeColor: Record<string, string> = {
  alta: "bg-destructive/10 border-destructive/30 text-destructive",
  media: "bg-warning/10 border-warning/30 text-warning",
  baixa: "bg-primary/10 border-primary/30 text-primary",
};

const prazoLabel: Record<string, string> = {
  imediato: "Imediato",
  "30 dias": "30 dias",
  "90 dias": "90 dias",
};

const impactoLabel: Record<string, string> = {
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo",
};

const prazoColor: Record<string, string> = {
  imediato: "destructive",
  "30 dias": "default",
  "90 dias": "secondary",
};

const impactoColor: Record<string, string> = {
  alto: "destructive",
  medio: "default",
  baixo: "secondary",
};

export function AiInsightsSection({ financialData, hasData }: Props) {
  const [insights, setInsights] = useState<AiInsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<Date | null>(null);

  const analyze = useCallback(async () => {
    if (!hasData) {
      toast.error("Sincronize os dados antes de analisar.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-insights", {
        body: { financialData },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setInsights(data as AiInsightsData);
      setLastAnalysis(new Date());
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro ao analisar com IA");
    } finally {
      setLoading(false);
    }
  }, [financialData, hasData]);

  const generateReport = useCallback(async () => {
    if (!hasData) {
      toast.error("Sincronize os dados antes de gerar o relatório.");
      return;
    }
    setReportLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-report", {
        body: { financialData },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const html = data.html;
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast.error("Permita pop-ups para gerar o relatório.");
        return;
      }
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro ao gerar relatório");
    } finally {
      setReportLoading(false);
    }
  }, [financialData, hasData]);

  const timeAgo = lastAnalysis
    ? (() => {
        const mins = Math.floor((Date.now() - lastAnalysis.getTime()) / 60000);
        if (mins < 1) return "agora";
        if (mins === 1) return "1 minuto atrás";
        return `${mins} minutos atrás`;
      })()
    : null;

  const resumoBorderColor =
    insights && financialData.margemLiquida < 0
      ? "border-l-destructive"
      : financialData.margemLiquida < 10
        ? "border-l-warning"
        : "border-l-success";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold">Análise com IA</h2>
          {timeAgo && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Última análise: {timeAgo}
            </span>
          )}
        </div>
        <Button onClick={analyze} disabled={loading || !hasData} size="sm" className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
          {loading ? "Analisando dados..." : "🤖 Analisar com IA"}
        </Button>
      </div>

      <AnimatePresence>
        {loading && !insights && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-card p-8 text-center"
          >
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Analisando dados financeiros do período {financialData.mesAtual}...</p>
          </motion.div>
        )}

        {insights && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Resumo */}
            <div className={`glass-card p-5 border-l-4 ${resumoBorderColor}`}>
              <p className="text-sm font-medium">{insights.resumo}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Alertas IA */}
              {insights.alertas.length > 0 && (
                <div className="glass-card p-5 min-h-[180px]">
                  <h3 className="font-heading text-base font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" /> Alertas IA
                  </h3>
                  <div className="space-y-2 overflow-y-auto max-h-[280px]">
                    {insights.alertas.map((a, i) => (
                      <div key={i} className={`p-3 rounded-lg text-sm border ${severidadeColor[a.severidade]}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{a.titulo}</p>
                            <p className="mt-1 opacity-80 line-clamp-2">{a.descricao}</p>
                          </div>
                          <Badge variant={a.severidade === "alta" ? "destructive" : a.severidade === "media" ? "default" : "secondary"} className="shrink-0 text-xs">
                            {a.impacto}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Oportunidades IA */}
              {insights.oportunidades.length > 0 && (
                <div className="glass-card p-5 min-h-[180px]">
                  <h3 className="font-heading text-base font-semibold mb-3 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-success" /> Oportunidades IA
                  </h3>
                  <div className="space-y-2 overflow-y-auto max-h-[280px]">
                    {insights.oportunidades.map((o, i) => (
                      <div key={i} className="p-3 rounded-lg text-sm bg-success/10 border border-success/30 text-success">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{o.titulo}</p>
                            <p className="mt-1 opacity-80 line-clamp-2">{o.descricao}</p>
                          </div>
                          <Badge className="shrink-0 bg-success/20 text-success border-success/30 text-xs">{o.potencial}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ações como tabela */}
            {insights.acoes.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="font-heading text-base font-semibold mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" /> Ações Recomendadas
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-3 font-medium">Ação</th>
                        <th className="pb-3 font-medium text-center w-[100px]">Prazo</th>
                        <th className="pb-3 font-medium text-center w-[100px]">Impacto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insights.acoes.map((a, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-3 pr-4">{a.acao}</td>
                          <td className="py-3 text-center">
                            <Badge variant={prazoColor[a.prazo] as any} className="text-xs">{prazoLabel[a.prazo] || a.prazo}</Badge>
                          </td>
                          <td className="py-3 text-center">
                            <Badge variant={impactoColor[a.impacto] as any} className="text-xs">{impactoLabel[a.impacto] || a.impacto}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
