import { motion } from "framer-motion";
import { StatCard } from "@/components/StatCard";
import { Wrench, Users, MapPin, Monitor, MoreHorizontal } from "lucide-react";

const costs = [
  { category: "Equipamentos", items: [
    { name: "Câmera RED Komodo (aluguel)", value: "R$ 4.500" },
    { name: "Kit iluminação", value: "R$ 2.800" },
    { name: "Drone DJI Inspire", value: "R$ 3.200" },
    { name: "Acessórios diversos", value: "R$ 2.300" },
  ]},
  { category: "Equipe", items: [
    { name: "Diretor de fotografia", value: "R$ 8.000" },
    { name: "Editor sênior", value: "R$ 6.500" },
    { name: "Assistentes de produção (3)", value: "R$ 7.500" },
    { name: "Colorista", value: "R$ 4.200" },
    { name: "Sound designer", value: "R$ 2.200" },
  ]},
  { category: "Infraestrutura", items: [
    { name: "Aluguel estúdio", value: "R$ 4.200" },
    { name: "Locações externas", value: "R$ 1.000" },
    { name: "Adobe Creative Suite", value: "R$ 1.200" },
    { name: "DaVinci Resolve Studio", value: "R$ 800" },
    { name: "Armazenamento cloud", value: "R$ 1.600" },
  ]},
];

export default function Custos() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Custos</h1>
        <p className="text-sm text-muted-foreground">Detalhamento de despesas mensais</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Equipamentos" value="R$ 12.800" icon={Wrench} delay={0} />
        <StatCard title="Equipe" value="R$ 28.400" icon={Users} delay={0.1} />
        <StatCard title="Locações" value="R$ 5.200" icon={MapPin} delay={0.15} />
        <StatCard title="Software" value="R$ 3.600" icon={Monitor} delay={0.2} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {costs.map((group, gi) => (
          <motion.div
            key={gi}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + gi * 0.1 }}
            className="glass-card p-5"
          >
            <h3 className="font-heading text-base font-semibold mb-3">{group.category}</h3>
            <div className="space-y-2">
              {group.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-heading font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
