import { DollarSign, FolderKanban, Users, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { motion } from "framer-motion";

export default function Index() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Visão Geral</h1>
        <p className="text-sm text-muted-foreground">Resumo financeiro da Adverse</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Receita Mensal" value="R$ 85.400" change="+12% vs mês anterior" changeType="positive" icon={DollarSign} delay={0} />
        <StatCard title="Projetos Ativos" value="7" change="3 em produção" changeType="neutral" icon={FolderKanban} delay={0.1} />
        <StatCard title="Clientes" value="12" change="+2 novos este mês" changeType="positive" icon={Users} delay={0.2} />
        <StatCard title="Lucro Líquido" value="R$ 32.150" change="+8% vs mês anterior" changeType="positive" icon={TrendingUp} delay={0.3} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Projetos Recentes</h2>
          <div className="space-y-3">
            {[
              { name: "Campanha Verão 2026", client: "Marca X", status: "Em produção", value: "R$ 25.000" },
              { name: "Vídeo Institucional", client: "TechCorp", status: "Pós-produção", value: "R$ 18.500" },
              { name: "Série Documental", client: "Canal Y", status: "Pré-produção", value: "R$ 42.000" },
            ].map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.client} · {p.status}</p>
                </div>
                <span className="font-heading text-sm font-semibold text-primary">{p.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Despesas por Categoria</h2>
          <div className="space-y-3">
            {[
              { category: "Equipamentos", amount: "R$ 12.800", pct: 24 },
              { category: "Equipe / Freelancers", amount: "R$ 28.400", pct: 53 },
              { category: "Locações", amount: "R$ 5.200", pct: 10 },
              { category: "Software / Licenças", amount: "R$ 3.600", pct: 7 },
              { category: "Outros", amount: "R$ 3.250", pct: 6 },
            ].map((d, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{d.category}</span>
                  <span className="text-muted-foreground">{d.amount}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary/80" style={{ width: `${d.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
