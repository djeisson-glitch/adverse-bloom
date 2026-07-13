import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PeriodProvider } from "@/contexts/PeriodContext";
import { TimerProvider } from "@/contexts/TimerContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { usePermissions, type ModuleId } from "@/hooks/usePermissions";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Index from "./pages/Index";
import Clientes from "./pages/Clientes";
import ClienteDetalhe from "./pages/ClienteDetalhe";
import FluxoDeCaixa from "./pages/FluxoDeCaixa";
import DREGerencial from "./pages/DREGerencial";
import Custos from "./pages/Custos";
import ResultadosMetas from "./pages/ResultadosMetas";
import CaixaRunway from "./pages/CaixaRunway";
import Insights from "./pages/Insights";
import Projecoes2026 from "./pages/Projecoes2026";
import Orcamentos from "./pages/Orcamentos";
import OrcamentosLegado from "./pages/OrcamentosLegado";
import NovoOrcamento from "./pages/NovoOrcamento";
import OrcamentoEditor from "./pages/OrcamentoEditor";
import CartaOrcamento from "./pages/CartaOrcamento";
import Leads from "./pages/Leads";
import LeadDetalhe from "./pages/LeadDetalhe";
import ProjetoDetalhe from "./pages/ProjetoDetalhe";
import ProjetoPecas from "./pages/ProjetoPecas";
import EntregavelDetalhe from "./pages/EntregavelDetalhe";
import RelatorioProjeto from "./pages/RelatorioProjeto";
import ProjetosLegado from "./pages/ProjetosLegado";
import ContasAPagar from "./pages/ContasAPagar";
import Comercial from "./pages/Comercial";
import Projetos from "./pages/Projetos";
import Assistente from "./pages/Assistente";
import MapaOperacional from "./pages/MapaOperacional";
import Agenda from "./pages/Agenda";
import Configuracoes from "./pages/Configuracoes";
import ConfiguracoesGeral from "./pages/ConfiguracoesGeral";
import ConfiguracoesContexto from "./pages/ConfiguracoesContexto";
import ConfiguracoesContratos from "./pages/ConfiguracoesContratos";
import ConfiguracoesUsuarios from "./pages/ConfiguracoesUsuarios";
import ConfiguracoesComercial from "./pages/ConfiguracoesComercial";
import ConfiguracoesOrcamentos from "./pages/ConfiguracoesOrcamentos";
import ConfiguracoesIntegracoes from "./pages/ConfiguracoesIntegracoes";
import ConfiguracoesPermissoes from "./pages/ConfiguracoesPermissoes";
import AuthContaAzul from "./pages/AuthContaAzul";
import PropostaPublica from "./pages/PropostaPublica";
// Onda 0 — placeholders dos novos módulos do Adverse OS Produtora
import Fechamento from "./pages/Fechamento";
import PosProducao from "./pages/PosProducao";
import Pauta from "./pages/Pauta";
import Calendario from "./pages/Calendario";
import Horas from "./pages/Horas";
import TimesheetPage from "./pages/Timesheet";
import Capacidade from "./pages/Capacidade";
import Planejamento from "./pages/Planejamento";
import Previsao from "./pages/Previsao";
import Fornecedores from "./pages/Fornecedores";
import FollowUps from "./pages/FollowUps";
import FaturamentoPage from "./pages/Faturamento";
import Relatorios from "./pages/Relatorios";
import TimePage from "./pages/Time";
import AdminPage from "./pages/Admin";
import AdminRateCard from "./pages/AdminRateCard";
import AdminWorkflows from "./pages/AdminWorkflows";
import AdminAprovacoes from "./pages/AdminAprovacoes";
import PortalCliente from "./pages/PortalCliente";
import PortalPublico from "./pages/PortalPublico";
import ContasFees from "./pages/ContasFees";
import Guia from "./pages/Guia";
import MinhaMesa from "./pages/MinhaMesa";
import PreviewOnda0 from "./pages/PreviewOnda0";
import NotFound from "./pages/NotFound";
import { Loader2, ShieldAlert } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
}

function ModuleGuard({ module, children }: { module: ModuleId; children: React.ReactNode }) {
  const { can, isLoading } = usePermissions();
  if (isLoading) return null;
  if (!can(module)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold text-foreground">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground mt-1">Você não tem permissão para acessar este módulo.</p>
      </div>
    );
  }
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TimerProvider>
            <PeriodProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
              <Route path="/financeiro" element={<ProtectedRoute><ModuleGuard module="financeiro"><Index /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/fluxo" element={<ProtectedRoute><ModuleGuard module="financeiro"><FluxoDeCaixa /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/dre" element={<ProtectedRoute><ModuleGuard module="financeiro"><DREGerencial /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/custos" element={<ProtectedRoute><ModuleGuard module="financeiro"><Custos /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/resultados" element={<ProtectedRoute><ModuleGuard module="financeiro"><ResultadosMetas /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/runway" element={<ProtectedRoute><ModuleGuard module="financeiro"><CaixaRunway /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/insights" element={<ProtectedRoute><ModuleGuard module="financeiro"><Insights /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/projecoes" element={<ProtectedRoute><ModuleGuard module="financeiro"><Projecoes2026 /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/contas" element={<ProtectedRoute><ModuleGuard module="financeiro"><ContasAPagar /></ModuleGuard></ProtectedRoute>} />
              <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
              <Route path="/clientes/:id" element={<ProtectedRoute><ClienteDetalhe /></ProtectedRoute>} />

              {/* Onda 0 — Produção */}
              <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
              <Route path="/leads/:id" element={<ProtectedRoute><LeadDetalhe /></ProtectedRoute>} />
              <Route path="/orcamentos" element={<ProtectedRoute><Orcamentos /></ProtectedRoute>} />
              <Route path="/orcamentos/novo" element={<ProtectedRoute><NovoOrcamento /></ProtectedRoute>} />
              <Route path="/orcamentos/:id" element={<ProtectedRoute><OrcamentoEditor /></ProtectedRoute>} />
              <Route path="/orcamentos/:id/carta" element={<ProtectedRoute><CartaOrcamento /></ProtectedRoute>} />
              <Route path="/orcamentos-legado" element={<ProtectedRoute><OrcamentosLegado /></ProtectedRoute>} />
              <Route path="/projetos" element={<ProtectedRoute><Projetos /></ProtectedRoute>} />
              <Route path="/projetos/:id" element={<ProtectedRoute><ProjetoDetalhe /></ProtectedRoute>} />
              <Route path="/projetos/:id/pecas" element={<ProtectedRoute><ProjetoPecas /></ProtectedRoute>} />
              <Route path="/projetos/:id/entregaveis/:did" element={<ProtectedRoute><EntregavelDetalhe /></ProtectedRoute>} />
              <Route path="/relatorios/projeto/:id" element={<ProtectedRoute><RelatorioProjeto /></ProtectedRoute>} />
              <Route path="/projetos-legado" element={<ProtectedRoute><ProjetosLegado /></ProtectedRoute>} />
              <Route path="/fechamento" element={<ProtectedRoute><Fechamento /></ProtectedRoute>} />
              <Route path="/pos-producao" element={<ProtectedRoute><PosProducao /></ProtectedRoute>} />
              <Route path="/pauta" element={<ProtectedRoute><Pauta /></ProtectedRoute>} />
              <Route path="/minha-mesa" element={<ProtectedRoute><MinhaMesa /></ProtectedRoute>} />
              <Route path="/calendario" element={<ProtectedRoute><Calendario /></ProtectedRoute>} />
              <Route path="/horas" element={<ProtectedRoute><Horas /></ProtectedRoute>} />
              <Route path="/timesheet" element={<ProtectedRoute><TimesheetPage /></ProtectedRoute>} />
              <Route path="/capacidade" element={<ProtectedRoute><Capacidade /></ProtectedRoute>} />
              <Route path="/planejamento" element={<ProtectedRoute><Planejamento /></ProtectedRoute>} />
              <Route path="/previsao" element={<ProtectedRoute><Previsao /></ProtectedRoute>} />

              {/* Onda 0 — Gestão */}
              <Route path="/contas-fees" element={<ProtectedRoute><ContasFees /></ProtectedRoute>} />
              <Route path="/fornecedores" element={<ProtectedRoute><Fornecedores /></ProtectedRoute>} />
              <Route path="/follow-ups" element={<ProtectedRoute><FollowUps /></ProtectedRoute>} />
              <Route path="/faturamento" element={<ProtectedRoute><FaturamentoPage /></ProtectedRoute>} />
              <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
              <Route path="/time" element={<ProtectedRoute><TimePage /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
              <Route path="/admin/rate-card" element={<ProtectedRoute><AdminRateCard /></ProtectedRoute>} />
              <Route path="/admin/workflows" element={<ProtectedRoute><AdminWorkflows /></ProtectedRoute>} />
              <Route path="/admin/aprovacoes" element={<ProtectedRoute><AdminAprovacoes /></ProtectedRoute>} />

              {/* Onda 0 — Extras */}
              <Route path="/portal" element={<ProtectedRoute><PortalCliente /></ProtectedRoute>} />
              <Route path="/guia" element={<ProtectedRoute><Guia /></ProtectedRoute>} />

              <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
              <Route path="/configuracoes/geral" element={<ProtectedRoute><ConfiguracoesGeral /></ProtectedRoute>} />
              <Route path="/configuracoes/contexto" element={<ProtectedRoute><ConfiguracoesContexto /></ProtectedRoute>} />
              <Route path="/configuracoes/contratos" element={<ProtectedRoute><ConfiguracoesContratos /></ProtectedRoute>} />
              <Route path="/configuracoes/usuarios" element={<ProtectedRoute><ConfiguracoesUsuarios /></ProtectedRoute>} />
              <Route path="/configuracoes/integracoes" element={<ProtectedRoute><ConfiguracoesIntegracoes /></ProtectedRoute>} />
              <Route path="/configuracoes/permissoes" element={<ProtectedRoute><ConfiguracoesPermissoes /></ProtectedRoute>} />
              <Route path="/auth/conta-azul" element={<ProtectedRoute><AuthContaAzul /></ProtectedRoute>} />
              <Route path="/proposta/:token" element={<PropostaPublica />} />
              <Route path="/portal/:token" element={<PortalPublico />} />
              {/* Rota temporária de preview da Onda 0 (sem auth) — remover após validação */}
              <Route path="/preview-onda-0" element={<PreviewOnda0 />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </PeriodProvider>
          </TimerProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
