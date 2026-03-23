import { motion } from "framer-motion";
import { Settings, BarChart3, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const sections = [
  { title: "Comercial", description: "Pipeline, metas, motivos de perda e follow-ups", icon: BarChart3, path: "/configuracoes/comercial" },
];

export default function Configuracoes() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie as configurações do sistema</p>
      </motion.div>

      <div className="space-y-3">
        {sections.map((s) => (
          <Card key={s.path} className="bg-card border-border cursor-pointer hover:border-primary/40 transition-colors" onClick={() => navigate(s.path)}>
            <CardContent className="flex items-center gap-4 py-4">
              <s.icon className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
