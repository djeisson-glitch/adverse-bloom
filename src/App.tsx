import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PeriodProvider } from "@/contexts/PeriodContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { usePermissions, type ModuleId } from "@/hooks/usePermissions";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Index from "./pages/Index";
import Clientes from "./pages/Clientes";
import ClienteDetalhe from "./pages/ClienteDetalhe";
import FluxoDeCaixa from "./pages/FluxoDeCaixa";
import Custos from "./pages/Custos";
import ResultadosMetas from "./pages/ResultadosMetas";
import CaixaRunway from "./pages/CaixaRunway";
import Insights from "./pages/Insights";
import Projecoes2026 from "./pages/Projecoes2026";
import Orcamentos from "./pages/Orcamentos";
import ContasAPagar from "./pages/ContasAPagar";
import Comercial from "./pages/Comercial";
import Projetos from "./pages/Projetos";
import Assistente from "./pages/Assistente";
import MapaOperacional from "./pages/MapaOperacional";
import Agenda from "./pages/Agenda";
import Configuracoes from "./pages/Configuracoes";
import ConfiguracoesGeral from "./pages/ConfiguracoesGeral";
import ConfiguracoesContexto from "./pages/ConfiguracoesContexto";
import ConfiguracoesUsuarios from "./pages/ConfiguracoesUsuarios";
import ConfiguracoesComercial from "./pages/ConfiguracoesComercial";
import ConfiguracoesOrcamentos from "./pages/ConfiguracoesOrcamentos";
import ConfiguracoesIntegracoes from "./pages/ConfiguracoesIntegracoes";
import ConfiguracoesPermissoes from "./pages/ConfiguracoesPermissoes";
import AuthContaAzul from "./pages/AuthContaAzul";
import PropostaPublica from "./pages/PropostaPublica";
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
          <PeriodProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
              <Route path="/financeiro" element={<ProtectedRoute><ModuleGuard module="financeiro"><Index /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/fluxo" element={<ProtectedRoute><ModuleGuard module="financeiro"><FluxoDeCaixa /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/custos" element={<ProtectedRoute><ModuleGuard module="financeiro"><Custos /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/resultados" element={<ProtectedRoute><ModuleGuard module="financeiro"><ResultadosMetas /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/runway" element={<ProtectedRoute><ModuleGuard module="financeiro"><CaixaRunway /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/insights" element={<ProtectedRoute><ModuleGuard module="financeiro"><Insights /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/projecoes" element={<ProtectedRoute><ModuleGuard module="financeiro"><Projecoes2026 /></ModuleGuard></ProtectedRoute>} />
              <Route path="/financeiro/contas" element={<ProtectedRoute><ModuleGuard module="financeiro"><ContasAPagar /></ModuleGuard></ProtectedRoute>} />
              <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
              <Route path="/clientes/:id" element={<ProtectedRoute><ClienteDetalhe /></ProtectedRoute>} />
              <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
              <Route path="/configuracoes/geral" element={<ProtectedRoute><ConfiguracoesGeral /></ProtectedRoute>} />
              <Route path="/configuracoes/contexto" element={<ProtectedRoute><ConfiguracoesContexto /></ProtectedRoute>} />
              <Route path="/configuracoes/usuarios" element={<ProtectedRoute><ConfiguracoesUsuarios /></ProtectedRoute>} />
              <Route path="/configuracoes/integracoes" element={<ProtectedRoute><ConfiguracoesIntegracoes /></ProtectedRoute>} />
              <Route path="/configuracoes/permissoes" element={<ProtectedRoute><ConfiguracoesPermissoes /></ProtectedRoute>} />
              <Route path="/auth/conta-azul" element={<ProtectedRoute><AuthContaAzul /></ProtectedRoute>} />
              <Route path="/proposta/:token" element={<PropostaPublica />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PeriodProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
