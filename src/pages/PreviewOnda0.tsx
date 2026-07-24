import { useState, ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Play, Search, Bell, LogOut, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Guia from "./Guia";
import Time from "./Time";
import Admin from "./Admin";
import AdminRateCard from "./AdminRateCard";
import ContasFees from "./ContasFees";
import Clientes from "./Clientes";
import Orcamentos from "./Orcamentos";
import FollowUps from "./FollowUps";
import Previsao from "./Previsao";
import Relatorios from "./Relatorios";
import Projetos from "./Projetos";
import Pauta from "./Pauta";
import Calendario from "./Calendario";
import PosProducao from "./PosProducao";
import PortalCliente from "./PortalCliente";
// Onda 4
import Horas from "./Horas";
import Timesheet from "./Timesheet";
import Capacidade from "./Capacidade";
import Planejamento from "./Planejamento";
import Fechamento from "./Fechamento";
import Faturamento from "./Faturamento";

/**
 * Rota temporária pra preview visual sem precisar logar.
 * Alterne entre as telas com os botões no topo.
 * Remover essa rota assim que a Onda 1 for validada.
 */

const TELAS = [
  { id: "guia", label: "Guia", node: <Guia /> },
  // Onda 2 — comercial
  { id: "orcamentos", label: "Orçamentos", node: <Orcamentos /> },
  { id: "follow-ups", label: "Follow-ups", node: <FollowUps /> },
  { id: "previsao", label: "Previsão", node: <Previsao /> },
  { id: "relatorios", label: "Relatórios", node: <Relatorios /> },
  // Onda 3 — produção
  { id: "projetos", label: "Projetos", node: <Projetos /> },
  { id: "pauta", label: "Pauta", node: <Pauta /> },
  { id: "calendario", label: "Calendário", node: <Calendario /> },
  { id: "pos-producao", label: "Pós-Produção", node: <PosProducao /> },
  { id: "portal", label: "Portal (admin)", node: <PortalCliente /> },
  // Onda 4 — operação
  { id: "horas", label: "Horas", node: <Horas /> },
  { id: "timesheet", label: "Timesheet", node: <Timesheet /> },
  { id: "capacidade", label: "Capacidade", node: <Capacidade /> },
  { id: "planejamento", label: "Planejamento", node: <Planejamento /> },
  { id: "fechamento", label: "Fechamento", node: <Fechamento /> },
  { id: "faturamento", label: "Faturamento", node: <Faturamento /> },
  // Onda 1 — fundação
  { id: "clientes", label: "Clientes", node: <Clientes /> },
  { id: "contas-fees", label: "Contas / Fees", node: <ContasFees /> },
  { id: "time", label: "Time", node: <Time /> },
  { id: "admin", label: "Admin", node: <Admin /> },
  { id: "admin-rate-card", label: "Rate card", node: <AdminRateCard /> },
];

function MockLayout({ children, current, onChange }: { children: ReactNode; current: string; onChange: (id: string) => void }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger />

            <div className="relative hidden max-w-md flex-1 md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar projeto, cliente, orçamento…"
                readOnly
                className="w-full rounded-lg border border-border bg-muted/40 py-1.5 pl-9 pr-12 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                ⌘K
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Apontar</span>
              </button>
              <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:text-foreground">
                <Bell className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-secondary text-[10px]">DM</AvatarFallback>
                  </Avatar>
                  <div className="hidden min-w-0 lg:block">
                    <p className="truncate text-xs font-medium leading-tight text-foreground">Djeisson</p>
                    <p className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground">
                      <ShieldCheck className="h-2.5 w-2.5 text-primary" />
                      Admin
                    </p>
                  </div>
                </div>
                <button className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Sair</span>
                </button>
              </div>
            </div>
          </header>

          {/* Switcher visual das telas em preview */}
          <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2 backdrop-blur">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Preview:
            </span>
            {TELAS.map((t) => (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  current === t.id
                    ? "border-primary/40 bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function PreviewOnda0() {
  const [tela, setTela] = useState("guia");
  const atual = TELAS.find((t) => t.id === tela) || TELAS[0];
  return (
    <MockLayout current={tela} onChange={setTela}>
      {atual.node}
    </MockLayout>
  );
}
