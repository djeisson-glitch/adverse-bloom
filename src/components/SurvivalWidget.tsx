import { AlertTriangle, ShieldAlert, CheckCircle } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { motion } from "framer-motion";
import type { CAItem } from "@/lib/financial";

interface SurvivalWidgetProps {
  burnRate: number;
  saldoAtual: number;
  recItems: CAItem[];
  payItems: CAItem[];
}

export function SurvivalWidget({ burnRate, saldoAtual, recItems, payItems }: SurvivalWidgetProps) {
  const now = new Date();
  const mesAtual = now.toISOString().slice(0, 7);
  const diasAteFinsMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

  const receberEsteMes = recItems
    .filter((r) => r?.data_vencimento?.startsWith(mesAtual) && r?.status !== "RECEIVED")
    .reduce((s, r) => s + (r?.total ?? 0), 0);

  const pagarEsteMes = payItems
    .filter((r) => r?.data_vencimento?.startsWith(mesAtual) && r?.status !== "PAID")
    .reduce((s, r) => s + (r?.total ?? 0), 0);

  const queimaMedia = burnRate > 0 ? burnRate : 20000;
  const runway = queimaMedia > 0 ? saldoAtual / queimaMedia : 0;

  const metaVendas = Math.max(0, queimaMedia - receberEsteMes);

  const cor = runway < 2 ? "destructive" : runway < 3 ? "warning" : "success";

  const borderColor =
    cor === "destructive"
      ? "border-l-destructive"
      : cor === "warning"
        ? "border-l-warning"
        : "border-l-success";

  const bgColor =
    cor === "destructive"
      ? "bg-destructive/5"
      : cor === "warning"
        ? "bg-warning/5"
        : "bg-success/5";

  const IconComponent = cor === "destructive" ? ShieldAlert : cor === "warning" ? AlertTriangle : CheckCircle;

  const iconColor =
    cor === "destructive"
      ? "text-destructive"
      : cor === "warning"
        ? "text-warning"
        : "text-success";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card p-6 border-l-8 ${borderColor} ${bgColor}`}
    >
      <div className="flex flex-col md:flex-row md:items-start gap-5">
        <IconComponent className={`h-10 w-10 shrink-0 ${iconColor}`} />

        <div className="flex-1 space-y-3">
          <h2 className="font-heading text-lg font-bold flex items-center gap-2">
            🚨 ALERTA DE CAIXA
          </h2>

          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
            <span className="text-2xl font-bold font-heading">
              RUNWAY: {runway.toFixed(1)} meses
            </span>
            <span className="text-sm text-muted-foreground">
              (Saldo atual: {formatCurrency(saldoAtual)})
            </span>
          </div>

          {metaVendas > 0 && (
            <p className="text-sm font-medium">
              VOCÊ PRECISA VENDER{" "}
              <span className={cor === "destructive" ? "text-destructive" : cor === "warning" ? "text-warning" : "text-success"}>
                {formatCurrency(metaVendas)}
              </span>{" "}
              NOS PRÓXIMOS {diasAteFinsMes} DIAS para manter a operação funcionando.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
            <span>Saldo atual: {formatCurrency(saldoAtual)}</span>
            <span>•</span>
            <span>Burn rate: {formatCurrency(queimaMedia)}/mês</span>
            <span>•</span>
            <span>A receber este mês: {formatCurrency(receberEsteMes)}</span>
            <span>•</span>
            <span>A pagar este mês: {formatCurrency(pagarEsteMes)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
