import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

const transactions = [
  { date: "07/03/2026", desc: "Pagamento - Marca X (Campanha Verão)", type: "entrada", value: "R$ 12.500" },
  { date: "06/03/2026", desc: "Aluguel estúdio - Março", type: "saida", value: "R$ 4.200" },
  { date: "05/03/2026", desc: "Pagamento freelancer - Editor", type: "saida", value: "R$ 3.800" },
  { date: "04/03/2026", desc: "Pagamento - TechCorp (Institucional)", type: "entrada", value: "R$ 9.250" },
  { date: "03/03/2026", desc: "Licença Adobe Creative Suite", type: "saida", value: "R$ 1.200" },
  { date: "02/03/2026", desc: "Pagamento - Canal Y (Adiantamento)", type: "entrada", value: "R$ 21.000" },
  { date: "01/03/2026", desc: "Seguro equipamentos", type: "saida", value: "R$ 890" },
];

export default function FluxoDeCaixa() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Fluxo de Caixa</h1>
        <p className="text-sm text-muted-foreground">Entradas e saídas financeiras</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Entradas (Março)", value: "R$ 42.750", color: "text-success" },
          { label: "Saídas (Março)", value: "R$ 10.090", color: "text-destructive" },
          { label: "Saldo", value: "R$ 32.660", color: "text-primary" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="glass-card p-5 text-center">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className={`mt-1 font-heading text-xl font-bold ${s.color}`}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-4 font-medium">Data</th>
                <th className="p-4 font-medium">Descrição</th>
                <th className="p-4 font-medium">Tipo</th>
                <th className="p-4 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="p-4 text-muted-foreground">{t.date}</td>
                  <td className="p-4">{t.desc}</td>
                  <td className="p-4">
                    {t.type === "entrada" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                        <ArrowUpRight className="h-3 w-3" /> Entrada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                        <ArrowDownRight className="h-3 w-3" /> Saída
                      </span>
                    )}
                  </td>
                  <td className={`p-4 text-right font-heading font-semibold ${t.type === "entrada" ? "text-success" : "text-destructive"}`}>{t.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
