import { useMemo } from "react";
import { motion } from "framer-motion";
import { FileText, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAllContaAzulCache, extractItems } from "@/hooks/useContaAzulCache";
import { usePeriod } from "@/contexts/PeriodContext";
import { PeriodFilter } from "@/components/PeriodFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { type CAItem, calcDRE, type DRERow } from "@/lib/financial";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function periodLabel(from: string, to: string): string {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  if (fy === ty && fm === tm) return `${MESES[fm - 1]}/${fy}`;
  return `${MESES[fm - 1]}/${fy} – ${MESES[tm - 1]}/${ty}`;
}

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function DREGerencial() {
  const { receivables, payables } = useAllContaAzulCache();
  const { period, setPeriod } = usePeriod();
  const recItems = useMemo(() => extractItems<CAItem>(receivables.data?.payload), [receivables.data]);
  const payItems = useMemo(() => extractItems<CAItem>(payables.data?.payload), [payables.data]);

  const dre = useMemo(() => calcDRE(recItems, payItems, period), [recItems, payItems, period]);
  const label = periodLabel(period.from, period.to);

  const rowClass = (r: DRERow) => {
    if (r.tipo === "resultado") return r.valor >= 0 ? "bg-primary/10 font-bold text-primary" : "bg-destructive/10 font-bold text-destructive";
    if (r.tipo === "subtotal") return "bg-muted/40 font-semibold";
    return "";
  };
  const valColor = (r: DRERow) => {
    if (r.tipo === "deducao") return "text-destructive";
    if (r.tipo === "resultado") return r.valor >= 0 ? "text-primary" : "text-destructive";
    return r.valor < 0 ? "text-destructive" : "text-foreground";
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("DRE Gerencial — Adverse", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Competência: ${label}`, 14, 25);
    doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, 14, 30);
    autoTable(doc, {
      startY: 36,
      head: [["Conta", "Valor (R$)", "% Receita"]],
      body: dre.map((r) => [r.label, formatCurrency(r.valor), fmtPct(r.pct)]),
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      headStyles: { fillColor: [225, 75, 50] },
      didParseCell: (d) => {
        const r = dre[d.row.index];
        if (d.section === "body" && (r?.tipo === "subtotal" || r?.tipo === "resultado")) {
          d.cell.styles.fontStyle = "bold";
          if (r.tipo === "resultado") d.cell.styles.fillColor = r.valor >= 0 ? [232, 245, 233] : [253, 232, 232];
          else d.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });
    doc.save(`DRE_${label.replace(/[\/ –]/g, "_")}.pdf`);
  };

  const loading = receivables.isLoading || payables.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> DRE Gerencial
          </h1>
          <p className="text-sm text-muted-foreground">Demonstração de resultado por competência — {label}</p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
          <Button onClick={exportPDF} variant="outline" size="sm" disabled={loading}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left font-medium px-4 py-3">Conta</th>
                <th className="text-right font-medium px-4 py-3">Valor</th>
                <th className="text-right font-medium px-4 py-3 w-28">% Receita</th>
              </tr>
            </thead>
            <tbody>
              {dre.map((r, i) => (
                <motion.tr
                  key={r.label}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className={`border-b border-border/40 ${rowClass(r)}`}
                >
                  <td className="px-4 py-2.5">{r.label}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${valColor(r)}`}>{formatCurrency(r.valor)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtPct(r.pct)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tudo por <strong>competência</strong> (data do fato gerador), seguindo as definições da empresa: impostos = só diretos sobre a venda;
        margem bruta = receita − impostos − custos do projeto; resultado operacional exclui empréstimos, juros e compra de equipamentos
        (que entram só no resultado final, como “não operacional”).
      </p>
    </div>
  );
}
