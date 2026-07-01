import { GitBranch, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function AdminWorkflows() {
  return (
    <div className="space-y-3">
      <Link to="/admin" className="ml-auto flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        voltar pra Admin
      </Link>
      <PlaceholderPage
        title="Workflows e status"
        icon={GitBranch}
        wave={3}
        description="Configurar status customizáveis por tipo de projeto (institucional, campanha, série, etc). Cada workflow define as etapas do Kanban de projeto."
        bullets={[
          "Um workflow por tipo de projeto",
          "Etapas com cor, ordem e regras (obrigatório aprovar antes de avançar?)",
          "Um projeto herda o workflow no momento do cadastro",
          "Já tem seed 'Padrão de Projeto' com 7 etapas na Onda 1",
        ]}
      />
    </div>
  );
}
