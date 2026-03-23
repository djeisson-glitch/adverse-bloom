import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PeriodProvider } from "@/contexts/PeriodContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Index from "./pages/Index";
import Clientes from "./pages/Clientes";
import FluxoDeCaixa from "./pages/FluxoDeCaixa";
import Custos from "./pages/Custos";
import ResultadosMetas from "./pages/ResultadosMetas";
import CaixaRunway from "./pages/CaixaRunway";
import Insights from "./pages/Insights";
import Projecoes2026 from "./pages/Projecoes2026";
import Orcamentos from "./pages/Orcamentos";
import ContasAPagar from "./pages/ContasAPagar";
import Comercial from "./pages/Comercial";
import MapaOperacional from "./pages/MapaOperacional";
import Configuracoes from "./pages/Configuracoes";
import ConfiguracoesComercial from "./pages/ConfiguracoesComercial";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

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
              <Route path="/financeiro" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
              <Route path="/fluxo-de-caixa" element={<ProtectedRoute><FluxoDeCaixa /></ProtectedRoute>} />
              <Route path="/custos" element={<ProtectedRoute><Custos /></ProtectedRoute>} />
              <Route path="/resultados-metas" element={<ProtectedRoute><ResultadosMetas /></ProtectedRoute>} />
              <Route path="/caixa-runway" element={<ProtectedRoute><CaixaRunway /></ProtectedRoute>} />
              <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
              <Route path="/projecoes-2026" element={<ProtectedRoute><Projecoes2026 /></ProtectedRoute>} />
              <Route path="/orcamentos" element={<ProtectedRoute><Orcamentos /></ProtectedRoute>} />
              <Route path="/contas-a-pagar" element={<ProtectedRoute><ContasAPagar /></ProtectedRoute>} />
              <Route path="/comercial" element={<ProtectedRoute><Comercial /></ProtectedRoute>} />
              <Route path="/mapa-operacional" element={<ProtectedRoute><MapaOperacional /></ProtectedRoute>} />
              <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
              <Route path="/configuracoes/comercial" element={<ProtectedRoute><ConfiguracoesComercial /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PeriodProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
