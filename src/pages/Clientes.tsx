import { useMemo } from "react";
import { motion } from "framer-motion";
import { useProjects } from "@/hooks/useProjects";
import { formatCurrency, formatPercent } from "@/lib/format";
import { Building2, Loader2 } from "lucide-react";

interface ClientSummary {
  name: string;
  totalFaturado: number;
  numProjetos: number;
  ticketMedio: number;
  margemMedia: number;
}

export default function Clientes() {
  const { data: projects, isLoading } = useProjects();

  const clients = useMemo<ClientSummary[]>(() => {
    if (!projects) return [];
    const map: Record<string, { total: number; count: number; margins: number[] }> = {};
    projects.forEach((p) => {
      if (!map[p.client_name]) map[p.client_name] = { total: 0, count: 0, margins: [] };
      map[p.client_name].total += p.sold_value ?? 0;
      map[p.client_name].count += 1;
      map[p.client_name].margins.push(p.gross_margin_percent ?? 0);
    });
    return Object.entries(map)
      .map(([name, d]) => ({
        name,
        totalFaturado: d.total,
        numProjetos: d.count,
        ticketMedio: d.count > 0 ? d.total / d.count : 0,
        margemMedia: d.margins.length > 0 ? d.margins.reduce((a, b) => a + b, 0) / d.margins.length : 0,
      }))
      .sort((a, b) => b.totalFaturado - a.totalFaturado);
  }, [projects]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Clientes</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada por cliente</p>
      </div>

      {clients.length === 0 ? (
        <p className="text-muted-foreground text-sm py-10 text-center">Nenhum cliente encontrado. Crie projetos primeiro.</p>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-4 font-medium">Cliente</th>
                <th className="p-4 font-medium text-right">Total Faturado</th>
                <th className="p-4 font-medium text-right">Projetos</th>
                <th className="p-4 font-medium text-right">Ticket Médio</th>
                <th className="p-4 font-medium text-right">Margem Bruta Média</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => (
                <motion.tr
                  key={c.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right font-heading font-semibold text-primary">{formatCurrency(c.totalFaturado)}</td>
                  <td className="p-4 text-right">{c.numProjetos}</td>
                  <td className="p-4 text-right text-muted-foreground">{formatCurrency(c.ticketMedio)}</td>
                  <td className={`p-4 text-right font-medium ${c.margemMedia >= 30 ? "text-success" : c.margemMedia >= 15 ? "text-warning" : "text-destructive"}`}>
                    {formatPercent(c.margemMedia)}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}
