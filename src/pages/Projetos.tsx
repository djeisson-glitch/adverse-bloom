import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";

const projects = [
  { name: "Campanha Verão 2026", client: "Marca X", status: "Em produção", value: "R$ 25.000", deadline: "15/04/2026" },
  { name: "Vídeo Institucional", client: "TechCorp", status: "Pós-produção", value: "R$ 18.500", deadline: "28/03/2026" },
  { name: "Série Documental", client: "Canal Y", status: "Pré-produção", value: "R$ 42.000", deadline: "30/06/2026" },
  { name: "Comercial TV", client: "Loja Z", status: "Concluído", value: "R$ 15.000", deadline: "01/02/2026" },
  { name: "Clipe Musical", client: "Artista W", status: "Em produção", value: "R$ 12.000", deadline: "20/04/2026" },
];

const statusColor: Record<string, string> = {
  "Pré-produção": "bg-warning/20 text-warning border-warning/30",
  "Em produção": "bg-primary/20 text-primary border-primary/30",
  "Pós-produção": "bg-accent/20 text-accent border-accent/30",
  "Concluído": "bg-success/20 text-success border-success/30",
};

export default function Projetos() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Projetos</h1>
        <p className="text-sm text-muted-foreground">Gerencie seus projetos de produção</p>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-4 font-medium">Projeto</th>
                <th className="p-4 font-medium">Cliente</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Valor</th>
                <th className="p-4 font-medium">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="p-4 font-medium">{p.name}</td>
                  <td className="p-4 text-muted-foreground">{p.client}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor[p.status] || ""}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="p-4 font-heading font-semibold text-primary">{p.value}</td>
                  <td className="p-4 text-muted-foreground">{p.deadline}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
