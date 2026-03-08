import { motion } from "framer-motion";
import { Building2, Mail } from "lucide-react";

const clients = [
  { name: "Marca X", contact: "contato@marcax.com", projects: 3, totalSpent: "R$ 78.000" },
  { name: "TechCorp", contact: "marketing@techcorp.com", projects: 2, totalSpent: "R$ 35.000" },
  { name: "Canal Y", contact: "producao@canaly.com", projects: 1, totalSpent: "R$ 42.000" },
  { name: "Loja Z", contact: "publicidade@lojaz.com", projects: 4, totalSpent: "R$ 62.500" },
  { name: "Artista W", contact: "mgmt@artistaw.com", projects: 1, totalSpent: "R$ 12.000" },
];

export default function Clientes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Clientes</h1>
        <p className="text-sm text-muted-foreground">Base de clientes da Adverse</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass-card p-5 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-heading font-semibold">{c.name}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  {c.contact}
                </div>
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <div>
                <p className="text-muted-foreground">Projetos</p>
                <p className="font-heading font-semibold">{c.projects}</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">Total Investido</p>
                <p className="font-heading font-semibold text-primary">{c.totalSpent}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
