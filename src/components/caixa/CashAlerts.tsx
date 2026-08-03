import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { type CAItem, getCat, STATUS_NAO_RECEBIVEL, STATUS_NAO_PAGAVEL } from "@/lib/financial";
import { hojeISO, emDiasISO } from "@/lib/dataLocal";

interface Props {
  recItems: CAItem[];
  payItems: CAItem[];
  saldoAtual: number;
  burnRate: number;
  runway: number;
}

interface Alert {
  level: "critical" | "warning" | "info";
  title: string;
  message: string;
  actions: string[];
}

export function CashAlerts({ recItems, payItems, saldoAtual, burnRate, runway }: Props) {
  const now = new Date();
  const today = hojeISO();
  const in7 = emDiasISO(7);

  const alerts = useMemo(() => {
    const list: Alert[] = [];

    // Inadimplência: vencidas, em aberto (nao_pago), exceto perdidas/canceladas e empréstimos
    const inadimplencia = recItems
      .filter(r => r?.data_vencimento && r.data_vencimento < today && (r?.nao_pago ?? 0) > 0 && !STATUS_NAO_RECEBIVEL.includes(r?.status ?? "") && getCat(r) !== "Empréstimos de Bancos")
      .reduce((s, r) => s + (r?.nao_pago ?? 0), 0);

    // 1. Runway < 2 meses
    if (runway < 2 && runway !== Infinity) {
      list.push({
        level: "critical",
        title: "Runway Crítico",
        message: `Runway abaixo de 2 meses (${runway.toFixed(1)} meses)`,
        actions: [
          inadimplencia > 0 ? `Priorizar cobrança de ${formatCurrency(inadimplencia)} em atraso` : "Acelerar recebimentos",
          "Revisar e reduzir despesas não essenciais",
        ],
      });
    }

    // 2. Contas a pagar > receber (7 dias)
    const aPagar7 = payItems.filter(r => r?.data_vencimento && r.data_vencimento >= today && r.data_vencimento <= in7 && (r?.nao_pago ?? 0) > 0 && !STATUS_NAO_PAGAVEL.includes(r?.status ?? ""))
      .reduce((s, r) => s + (r?.nao_pago ?? 0), 0);
    const aReceber7 = recItems.filter(r => r?.data_vencimento && r.data_vencimento >= today && r.data_vencimento <= in7 && (r?.nao_pago ?? 0) > 0 && !STATUS_NAO_RECEBIVEL.includes(r?.status ?? "") && getCat(r) !== "Empréstimos de Bancos")
      .reduce((s, r) => s + (r?.nao_pago ?? 0), 0);
    if (aPagar7 > aReceber7 && aPagar7 > 0) {
      list.push({
        level: "warning",
        title: "Pressão de Caixa 7 Dias",
        message: `Contas a pagar (${formatCurrency(aPagar7)}) maior que a receber (${formatCurrency(aReceber7)}) nos próximos 7 dias`,
        actions: ["Confirmar recebimentos pendentes", "Negociar prazos de pagamento"],
      });
    }

    // 3. Inadimplência > R$ 10k
    if (inadimplencia >= 10000) {
      list.push({
        level: "warning",
        title: "Inadimplência Elevada",
        message: `${formatCurrency(inadimplencia)} em inadimplência`,
        actions: ["Acionar clientes inadimplentes", "Avaliar desconto para antecipação"],
      });
    }

    if (list.length === 0) {
      list.push({
        level: "info",
        title: "Caixa Saudável",
        message: "Nenhum alerta crítico no momento. Continue monitorando.",
        actions: [],
      });
    }

    return list;
  }, [recItems, payItems, saldoAtual, burnRate, runway, today, in7]);

  const levelStyles = {
    critical: "border-destructive/50 bg-destructive/5",
    warning: "border-warning/50 bg-warning/5",
    info: "border-primary/30 bg-primary/5",
  };
  const levelIcons = {
    critical: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };
  const levelTextColor = {
    critical: "text-destructive",
    warning: "text-warning",
    info: "text-primary",
  };

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
      <h2 className="font-heading text-lg font-semibold mb-4">Alertas Automáticos</h2>
      <div className="space-y-3">
        {alerts.map((alert, i) => {
          const Icon = levelIcons[alert.level];
          return (
            <div key={i} className={`glass-card p-4 border ${levelStyles[alert.level]} rounded-lg`}>
              <div className="flex items-start gap-3">
                <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${levelTextColor[alert.level]}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${levelTextColor[alert.level]}`}>{alert.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{alert.message}</p>
                  {alert.actions.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {alert.actions.map((action, j) => (
                        <li key={j} className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <span className="h-1 w-1 rounded-full bg-muted-foreground shrink-0" />
                          {action}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
