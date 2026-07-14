import {
  Home,
  Inbox,
  Sprout,
  DollarSign,
  ChevronDown,
  LogOut,
  Users,
  BookOpen,
  Send,
  ClipboardList,
  LayoutGrid,
  Scale,
  Clapperboard,
  ListChecks,
  CalendarDays,
  Timer,
  CalendarCheck,
  Gauge,
  CalendarClock,
  TrendingUp,
  Building2,
  CalendarRange,
  FileText,
  BarChart3,
  UsersRound,
  Settings2,
  TrendingUp as TrendingUpFin,
  Receipt,
  Target,
  Vault,
  Lightbulb,
  LineChart,
  CreditCard,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { usePermissions, type ModuleId } from "@/hooks/usePermissions";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  module: ModuleId;   // quem não pode ver o módulo não vê o item
};

const producaoItems: NavItem[] = [
  { title: "Início", url: "/", icon: Home, module: "inicio" },
  { title: "Demandas", url: "/demandas", icon: Inbox, module: "demandas" },
  { title: "Leads", url: "/leads", icon: Sprout, module: "leads" },
  { title: "Orçamentos", url: "/orcamentos", icon: ClipboardList, module: "orcamentos" },
  { title: "Projetos", url: "/projetos", icon: LayoutGrid, module: "projetos" },
  { title: "Minha mesa", url: "/minha-mesa", icon: Clapperboard, module: "minha_mesa" },
  { title: "Fechamento", url: "/fechamento", icon: Scale, module: "fechamento" },
  { title: "Pós-Produção", url: "/pos-producao", icon: Clapperboard, module: "pos_producao" },
  { title: "Pauta", url: "/pauta", icon: ListChecks, module: "pauta" },
  { title: "Calendário", url: "/calendario", icon: CalendarDays, module: "calendario" },
  { title: "Horas", url: "/horas", icon: Timer, module: "horas" },
  { title: "Timesheet", url: "/timesheet", icon: CalendarCheck, module: "timesheet" },
  { title: "Capacidade", url: "/capacidade", icon: Gauge, module: "capacidade" },
  { title: "Planejamento", url: "/planejamento", icon: CalendarClock, module: "planejamento" },
  { title: "Previsão", url: "/previsao", icon: TrendingUp, module: "previsao" },
];

const gestaoItems: NavItem[] = [
  { title: "Clientes", url: "/clientes", icon: Users, module: "clientes" },
  { title: "Contas / Fees", url: "/contas-fees", icon: Building2, module: "contas_fees" },
  { title: "Fornecedores", url: "/fornecedores", icon: Clapperboard, module: "fornecedores" },
  { title: "Follow-ups", url: "/follow-ups", icon: CalendarRange, module: "follow_ups" },
  { title: "Faturamento", url: "/faturamento", icon: FileText, module: "faturamento" },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3, module: "relatorios" },
  { title: "Time", url: "/time", icon: UsersRound, module: "time" },
  { title: "Admin", url: "/admin", icon: Settings2, module: "admin" },
];

const financeiroItems: NavItem[] = [
  { title: "DRE Gerencial", url: "/financeiro/dre", icon: FileText, module: "financeiro" },
  { title: "Fluxo de Caixa", url: "/financeiro/fluxo", icon: TrendingUpFin, module: "financeiro" },
  { title: "Custos", url: "/financeiro/custos", icon: Receipt, module: "financeiro" },
  { title: "Resultados", url: "/financeiro/resultados", icon: Target, module: "financeiro" },
  { title: "Runway", url: "/financeiro/runway", icon: Vault, module: "financeiro" },
  { title: "Insights", url: "/financeiro/insights", icon: Lightbulb, module: "financeiro" },
  { title: "Projeções", url: "/financeiro/projecoes", icon: LineChart, module: "financeiro" },
  { title: "Contas a Pagar", url: "/financeiro/contas", icon: CreditCard, module: "financeiro" },
];

function SidebarLink({ item, collapsed, small = false }: { item: NavItem; collapsed: boolean; small?: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuButton asChild>
      <NavLink
        to={item.url}
        end={item.url === "/"}
        className="hover:bg-sidebar-accent/50"
        activeClassName="bg-sidebar-accent text-primary font-medium"
      >
        <Icon className={`mr-2 ${small ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
        {!collapsed && <span className={small ? "text-sm" : ""}>{item.title}</span>}
      </NavLink>
    </SidebarMenuButton>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, user, profile } = useAuth();
  const { can } = usePermissions();
  // O menu só mostra o que a pessoa realmente pode abrir. (A RLS é quem manda
  // de verdade — isto aqui é conveniência, não segurança.)
  const producaoVisiveis = producaoItems.filter((i) => can(i.module));
  const gestaoVisiveis = gestaoItems.filter((i) => can(i.module));

  const isFinanceiroActive = financeiroItems.some((i) => location.pathname === i.url);
  const [financeiroOpen, setFinanceiroOpen] = useState(isFinanceiroActive);

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "";
  const avatarUrl = profile?.avatar_url || "";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="overflow-y-auto overflow-x-hidden">
        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <span className="text-lg font-bold text-primary">A</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h2 className="text-sm font-bold tracking-tight text-foreground">ADVERSE</h2>
              <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                Operating System
              </p>
            </div>
          )}
        </div>

        {/* PRODUÇÃO */}
        {producaoVisiveis.length > 0 && (
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
              Produção
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {producaoVisiveis.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarLink item={item} collapsed={collapsed} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}

        {/* GESTÃO */}
        {gestaoVisiveis.length > 0 && (
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
              Gestão
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {gestaoVisiveis.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarLink item={item} collapsed={collapsed} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}

        {/* FINANCEIRO (collapsible — legado, mantém sub-menu) */}
        {can("financeiro") && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
                Financeiro
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <Collapsible open={financeiroOpen} onOpenChange={setFinanceiroOpen}>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        className={`hover:bg-sidebar-accent/50 w-full ${
                          isFinanceiroActive ? "text-primary font-medium" : ""
                        }`}
                      >
                        <DollarSign className="mr-2 h-4 w-4" />
                        {!collapsed && (
                          <>
                            <span className="flex-1 text-left">Módulo Financeiro</span>
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${
                                financeiroOpen ? "rotate-180" : ""
                              }`}
                            />
                          </>
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenu className="ml-4 border-l border-sidebar-border pl-2">
                        {financeiroItems.map((item) => (
                          <SidebarMenuItem key={item.url}>
                            <SidebarLink item={item} collapsed={collapsed} small />
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="shrink-0 space-y-1 border-t border-sidebar-border p-3">
        {/* Portal e Guia */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarLink item={{ title: "Portal do Cliente", url: "/portal", icon: Send }} collapsed={collapsed} small />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarLink item={{ title: "Guia", url: "/guia", icon: BookOpen }} collapsed={collapsed} small />
          </SidebarMenuItem>
        </SidebarMenu>

        {!collapsed && (
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <Avatar className="h-7 w-7">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="bg-secondary text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{displayName}</p>
              <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        )}

        <SidebarMenuButton
          onClick={signOut}
          className="text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
