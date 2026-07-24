import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PeriodProvider } from "@/contexts/PeriodContext";
import { TimerProvider } from "@/contexts/TimerContext";
import { ConfirmProvider } from "@/components/ui/confirm";
import { PrivacidadeProvider } from "@/contexts/PrivacidadeContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { usePermissions, type ModuleId } from "@/hooks/usePermissions";
import Login from "./pages/Login";
import Home from "./pages/Home";
import HomeEquipe from "./pages/HomeEquipe";
import Notificacoes from "./pages/Notificacoes";
import Atividades from "./pages/Atividades";
import BancoTalentos from "./pages/BancoTalentos";
import CadastroFornecedor from "./pages/CadastroFornecedor";
import CadastroFreelancer from "./pages/CadastroFreelancer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
import CatalogoItens from "./pages/CatalogoItens";
import ProjetoDetalhe from "./pages/ProjetoDetalhe";
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
import ConfiguracoesComercial from "./pages/ConfiguracoesComercial";
import ConfiguracoesOrcamentos from "./pages/ConfiguracoesOrcamentos";
import ConfiguracoesIntegracoes from "./pages/ConfiguracoesIntegracoes";
import ConfiguracoesPermissoes from "./pages/ConfiguracoesPermissoes";
import AuthContaAzul from "./pages/AuthContaAzul";
import PropostaPublica from "./pages/PropostaPublica";
import CartaPublica from "./pages/CartaPublica";
import Demandas from "./pages/Demandas";
import SolicitarDemanda from "./pages/SolicitarDemanda";
import BriefingPublico from "./pages/BriefingPublico";
// Onda 0 — placeholders dos novos módulos do Adverse OS Produtora
import Fechamento from "./pages/Fechamento";
import PosProducao from "./pages/PosProducao";
import Pauta from "./pages/Pauta";
import Calendario from "./pages/Calendario";
import AgendaProducao from "./pages/AgendaProducao";
import Horas from "./pages/Horas";
import TimesheetPage from "./pages/Timesheet";
import Capacidade from "./pages/Capacidade";
import Planejamento from "./pages/Planejamento";
import Previsao from "./pages/Previsao";
import FollowUps from "./pages/FollowUps";
import FaturamentoPage from "./pages/Faturamento";
import FaturamentoMensal from "./pages/FaturamentoMensal";
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

// Atualização em segundo plano pra TODAS as telas (sem precisar dar refresh):
// - refetchOnWindowFocus/Reconnect: volta pra aba ou reconecta → atualiza na hora.
// - refetchInterval 30s enquanto a aba está ativa (não gasta bateria em aba oculta).
// Queries "ao vivo" (comentários, notificações) têm intervalo próprio menor e
// sobrescrevem esse padrão.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: 30000,
      refetchIntervalInBackground: false,
      staleTime: 10000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  // Crash numa página não pode mais apagar o app inteiro (tela preta).
  return <DashboardLayout><ErrorBoundary>{children}</ErrorBoundary></DashboardLayout>;
}

/** A Home depende do papel: financeira pra gestão, panorama pessoal pra equipe.
 *  Escolher aqui (e não dentro da Home) evita disparar as queries de dinheiro
 *  pra quem a RLS vai devolver vazio mesmo. */
function HomeSwitch() {
  const { canSeeMoney, isLoading } = usePermissions();
  if (isLoading) return null;
  return canSeeMoney ? <Home /> : <HomeEquipe />;
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
            <ConfirmProvider>
            <PrivacidadeProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><HomeSwitch /></ProtectedRoute>} />
              <Route path="/financeiro" element={<ProtectedRoute><ModuleGuard module="financeiro"><Index /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/fluxo" element={<ProtectedRoute><ModuleGuard module="financeiro"><FluxoDeCaixa /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/dre" element={<ProtectedRoute><ModuleGuard module="financeiro"><DREGerencial /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/custos" element={<ProtectedRoute><ModuleGuard module="financeiro"><Custos /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/resultados" element={<ProtectedRoute><ModuleGuard module="financeiro"><ResultadosMetas /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/runway" element={<ProtectedRoute><ModuleGuard module="financeiro"><CaixaRunway /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/insights" element={<ProtectedRoute><ModuleGuard module="financeiro"><Insights /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/projecoes" element={<ProtectedRoute><ModuleGuard module="financeiro"><Projecoes2026 /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/contas" element={<ProtectedRoute><ModuleGuard module="financeiro"><ContasAPagar /></ModuleGuard></ProtectedRoute>} />
              <Route path="/clientes" element={<ProtectedRoute><ModuleGuard module="clientes"><Clientes /></ModuleGuard></ProtectedRoute>} />
              <Route path="/clientes/:id" element={<ProtectedRoute><ModuleGuard module="clientes"><ClienteDetalhe /></ModuleGuard></ProtectedRoute>} />

              {/* Onda 0 — Produção */}
              <Route path="/demandas" element={<ProtectedRoute><ModuleGuard module="demandas"><Demandas /></ModuleGuard></ProtectedRoute>} />
              <Route path="/leads" element={<ProtectedRoute><ModuleGuard module="leads"><Leads /></ModuleGuard></ProtectedRoute>} />
              <Route path="/leads/:id" element={<ProtectedRoute><ModuleGuard module="leads"><LeadDetalhe /></ModuleGuard></ProtectedRoute>} />
              <Route path="/orcamentos" element={<ProtectedRoute><ModuleGuard module="orcamentos"><Orcamentos /></ModuleGuard></ProtectedRoute>} />
              <Route path="/orcamentos/novo" element={<ProtectedRoute><ModuleGuard module="orcamentos"><NovoOrcamento /></ModuleGuard></ProtectedRoute>} />
              <Route path="/orcamentos/:id" element={<ProtectedRoute><ModuleGuard module="orcamentos"><OrcamentoEditor /></ModuleGuard></ProtectedRoute>} />
              <Route path="/orcamentos/:id/carta" element={<ProtectedRoute><ModuleGuard module="orcamentos"><CartaOrcamento /></ModuleGuard></ProtectedRoute>} />
              <Route path="/orcamentos-legado" element={<ProtectedRoute><ModuleGuard module="orcamentos"><OrcamentosLegado /></ModuleGuard></ProtectedRoute>} />
              <Route path="/projetos" element={<ProtectedRoute><ModuleGuard module="projetos"><Projetos /></ModuleGuard></ProtectedRoute>} />
              <Route path="/projetos/:id" element={<ProtectedRoute><ModuleGuard module="projetos"><ProjetoDetalhe /></ModuleGuard></ProtectedRoute>} />
              <Route path="/projetos/:id/entregaveis/:did" element={<ProtectedRoute><ModuleGuard module="projetos"><EntregavelDetalhe /></ModuleGuard></ProtectedRoute>} />
              <Route path="/relatorios/projeto/:id" element={<ProtectedRoute><ModuleGuard module="relatorios"><RelatorioProjeto /></ModuleGuard></ProtectedRoute>} />
              {/* Legado: mostra valor vendido/custos/faturado sem gate — é tela de gestão, não da equipe. */}
              <Route path="/projetos-legado" element={<ProtectedRoute><ModuleGuard module="relatorios"><ProjetosLegado /></ModuleGuard></ProtectedRoute>} />
              <Route path="/fechamento" element={<ProtectedRoute><ModuleGuard module="fechamento"><Fechamento /></ModuleGuard></ProtectedRoute>} />
              <Route path="/pos-producao" element={<ProtectedRoute><ModuleGuard module="pos_producao"><PosProducao /></ModuleGuard></ProtectedRoute>} />
              <Route path="/pauta" element={<ProtectedRoute><ModuleGuard module="pauta"><Pauta /></ModuleGuard></ProtectedRoute>} />
              <Route path="/minha-mesa" element={<ProtectedRoute><ModuleGuard module="minha_mesa"><MinhaMesa /></ModuleGuard></ProtectedRoute>} />
              <Route path="/calendario" element={<ProtectedRoute><ModuleGuard module="calendario"><Calendario /></ModuleGuard></ProtectedRoute>} />
              <Route path="/saidas" element={<ProtectedRoute><ModuleGuard module="calendario"><AgendaProducao /></ModuleGuard></ProtectedRoute>} />
              <Route path="/horas" element={<ProtectedRoute><ModuleGuard module="horas"><Horas /></ModuleGuard></ProtectedRoute>} />
              <Route path="/timesheet" element={<ProtectedRoute><ModuleGuard module="timesheet"><TimesheetPage /></ModuleGuard></ProtectedRoute>} />
              <Route path="/capacidade" element={<ProtectedRoute><ModuleGuard module="capacidade"><Capacidade /></ModuleGuard></ProtectedRoute>} />
              <Route path="/planejamento" element={<ProtectedRoute><ModuleGuard module="planejamento"><Planejamento /></ModuleGuard></ProtectedRoute>} />
              <Route path="/previsao" element={<ProtectedRoute><ModuleGuard module="previsao"><Previsao /></ModuleGuard></ProtectedRoute>} />

              {/* Onda 0 — Gestão */}
              <Route path="/contas-fees" element={<ProtectedRoute><ModuleGuard module="contas_fees"><ContasFees /></ModuleGuard></ProtectedRoute>} />
              {/* /fornecedores (supplier_contacts) foi absorvido por /banco-talentos.
                  A tabela continua viva: é o autocomplete de fornecedor no
                  lançamento de custo (CostEntryTab/BudgetForm). */}
              <Route path="/fornecedores" element={<Navigate to="/banco-talentos" replace />} />
              <Route path="/follow-ups" element={<ProtectedRoute><ModuleGuard module="follow_ups"><FollowUps /></ModuleGuard></ProtectedRoute>} />
              <Route path="/faturamento" element={<ProtectedRoute><ModuleGuard module="faturamento"><FaturamentoPage /></ModuleGuard></ProtectedRoute>} />
              <Route path="/faturamento-mensal" element={<ProtectedRoute><ModuleGuard module="faturamento"><FaturamentoMensal /></ModuleGuard></ProtectedRoute>} />
              <Route path="/relatorios" element={<ProtectedRoute><ModuleGuard module="relatorios"><Relatorios /></ModuleGuard></ProtectedRoute>} />
              <Route path="/time" element={<ProtectedRoute><ModuleGuard module="time"><TimePage /></ModuleGuard></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><ModuleGuard module="admin"><AdminPage /></ModuleGuard></ProtectedRoute>} />
              <Route path="/admin/catalogo" element={<ProtectedRoute><ModuleGuard module="admin"><CatalogoItens /></ModuleGuard></ProtectedRoute>} />
              <Route path="/admin/rate-card" element={<ProtectedRoute><ModuleGuard module="admin"><AdminRateCard /></ModuleGuard></ProtectedRoute>} />
              <Route path="/admin/workflows" element={<ProtectedRoute><ModuleGuard module="admin"><AdminWorkflows /></ModuleGuard></ProtectedRoute>} />
              <Route path="/admin/aprovacoes" element={<ProtectedRoute><ModuleGuard module="admin"><AdminAprovacoes /></ModuleGuard></ProtectedRoute>} />

              {/* Onda 0 — Extras */}
              <Route path="/portal" element={<ProtectedRoute><ModuleGuard module="portal"><PortalCliente /></ModuleGuard></ProtectedRoute>} />
              <Route path="/notificacoes" element={<ProtectedRoute><Notificacoes /></ProtectedRoute>} />
              <Route path="/atividades" element={<ProtectedRoute><Atividades /></ProtectedRoute>} />
              <Route path="/banco-talentos" element={<ProtectedRoute><BancoTalentos /></ProtectedRoute>} />
              <Route path="/guia" element={<ProtectedRoute><Guia /></ProtectedRoute>} />

              <Route path="/configuracoes" element={<ProtectedRoute><ModuleGuard module="admin"><Configuracoes /></ModuleGuard></ProtectedRoute>} />
              <Route path="/configuracoes/geral" element={<ProtectedRoute><ModuleGuard module="admin"><ConfiguracoesGeral /></ModuleGuard></ProtectedRoute>} />
              <Route path="/configuracoes/contexto" element={<ProtectedRoute><ModuleGuard module="admin"><ConfiguracoesContexto /></ModuleGuard></ProtectedRoute>} />
              <Route path="/configuracoes/contratos" element={<ProtectedRoute><ModuleGuard module="admin"><ConfiguracoesContratos /></ModuleGuard></ProtectedRoute>} />
              <Route path="/configuracoes/integracoes" element={<ProtectedRoute><ModuleGuard module="admin"><ConfiguracoesIntegracoes /></ModuleGuard></ProtectedRoute>} />
              <Route path="/configuracoes/permissoes" element={<ProtectedRoute><ModuleGuard module="admin"><ConfiguracoesPermissoes /></ModuleGuard></ProtectedRoute>} />
              <Route path="/auth/conta-azul" element={<ProtectedRoute><ModuleGuard module="admin"><AuthContaAzul /></ModuleGuard></ProtectedRoute>} />
              <Route path="/proposta/:token" element={<PropostaPublica />} />
              <Route path="/carta/:token" element={<CartaPublica />} />
              <Route path="/solicitar/:slug" element={<SolicitarDemanda />} />
              {/* Cadastros públicos — banco de talentos e fornecedores */}
              <Route path="/cadastro/fornecedor" element={<CadastroFornecedor />} />
              <Route path="/cadastro/freelancer" element={<CadastroFreelancer />} />
              <Route path="/briefing/:token" element={<BriefingPublico />} />
              <Route path="/portal/:token" element={<PortalPublico />} />
              {/* Rota temporária de preview da Onda 0 (sem auth) — remover após validação */}
              <Route path="/preview-onda-0" element={<PreviewOnda0 />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </PrivacidadeProvider>
            </ConfirmProvider>
            </PeriodProvider>
          </TimerProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
