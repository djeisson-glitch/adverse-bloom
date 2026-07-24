import {
  Home,
  Inbox,
  Sprout,
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
  Video,
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
  Truck,
  Bell,
  History,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
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
  module?: ModuleId;   // sem módulo = qualquer pessoa logada
  soMoney?: boolean;   // só aparece pra quem vê dinheiro (visões de gestão)
};

type NavGrupo = {
  id: string;        // chave do estado aberto/fechado
  label?: string;    // sem label = grupo fixo do topo (não colapsa)
  itens: NavItem[];
};

/**
 * O menu é agrupado pela PERGUNTA que a pessoa está se fazendo, não pelo acaso
 * histórico. Antes "Produção" era um saco de gatos: misturava comercial
 * (Demandas, Orçamentos), execução (Projetos, Pauta), tempo (Horas, Timesheet)
 * e planejamento (Capacidade, Previsão) — 15 itens sem parentesco nenhum.
 */
const GRUPOS: NavGrupo[] = [
  {
    id: "topo",
    itens: [
      { title: "Início", url: "/", icon: Home, module: "inicio" },
      { title: "Minha mesa", url: "/minha-mesa", icon: Clapperboard, module: "minha_mesa" },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    itens: [
      { title: "Demandas", url: "/demandas", icon: Inbox, module: "demandas" },
      { title: "Leads", url: "/leads", icon: Sprout, module: "leads" },
      { title: "Orçamentos", url: "/orcamentos", icon: ClipboardList, module: "orcamentos" },
      { title: "Clientes", url: "/clientes", icon: Users, module: "clientes" },
      { title: "Follow-ups", url: "/follow-ups", icon: CalendarRange, module: "follow_ups" },
    ],
  },
  {
    id: "producao",
    label: "Produção",
    itens: [
      { title: "Projetos", url: "/projetos", icon: LayoutGrid, module: "projetos" },
      { title: "Pauta", url: "/pauta", icon: ListChecks, module: "pauta" },
      { title: "Pós-Produção", url: "/pos-producao", icon: Clapperboard, module: "pos_producao" },
      { title: "Saídas de produção", url: "/saidas", icon: Video, module: "calendario" },
      { title: "Calendário", url: "/calendario", icon: CalendarDays, module: "calendario" },
    ],
  },
  {
    id: "tempo",
    label: "Tempo",
    itens: [
      { title: "Horas", url: "/horas", icon: Timer, module: "horas" },
      { title: "Timesheet", url: "/timesheet", icon: CalendarCheck, module: "timesheet" },
      // Gestão (só quem vê dinheiro) — as próprias páginas exigem canSeeMoney.
      { title: "Capacidade", url: "/capacidade", icon: Gauge, module: "capacidade", soMoney: true },
      { title: "Planejamento", url: "/planejamento", icon: CalendarClock, module: "planejamento", soMoney: true },
      { title: "Previsão", url: "/previsao", icon: TrendingUp, module: "previsao", soMoney: true },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    itens: [
      { title: "Faturamento", url: "/faturamento", icon: FileText, module: "faturamento" },
      { title: "Faturamento mensal", url: "/faturamento-mensal", icon: Receipt, module: "faturamento" },
      { title: "Fechamento", url: "/fechamento", icon: Scale, module: "fechamento" },
      { title: "Contas / Fees", url: "/contas-fees", icon: Building2, module: "contas_fees" },
      { title: "Relatórios", url: "/relatorios", icon: BarChart3, module: "relatorios" },
      { title: "DRE Gerencial", url: "/financeiro/dre", icon: FileText, module: "financeiro" },
      { title: "Fluxo de Caixa", url: "/financeiro/fluxo", icon: TrendingUpFin, module: "financeiro" },
      { title: "Custos", url: "/financeiro/custos", icon: Receipt, module: "financeiro" },
      { title: "Contas a Pagar", url: "/financeiro/contas", icon: CreditCard, module: "financeiro" },
      { title: "Resultados", url: "/financeiro/resultados", icon: Target, module: "financeiro" },
      { title: "Runway", url: "/financeiro/runway", icon: Vault, module: "financeiro" },
      { title: "Insights", url: "/financeiro/insights", icon: Lightbulb, module: "financeiro" },
      { title: "Projeções", url: "/financeiro/projecoes", icon: LineChart, module: "financeiro" },
    ],
  },
  {
    id: "ajustes",
    label: "Ajustes",
    itens: [
      { title: "Time", url: "/time", icon: UsersRound, module: "time" },
      { title: "Fornecedores & Freelas", url: "/banco-talentos", icon: Truck },
      { title: "Notificações", url: "/notificacoes", icon: Bell },
      { title: "Log geral", url: "/atividades", icon: History, module: "admin" },
      { title: "Admin", url: "/admin", icon: Settings2, module: "admin" },
    ],
  },
];

const CHAVE_ABERTOS = "adverse.sidebar.grupo";

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
  const { can, canSeeMoney } = usePermissions();

  // O menu só mostra o que a pessoa pode abrir. (A RLS é quem manda de verdade —
  // isto aqui é conveniência, não segurança.) Grupo sem item nenhum some.
  // Itens soMoney (visões de gestão) exigem acesso ao financeiro.
  const grupos = useMemo(
    () =>
      GRUPOS.map((g) => ({
        ...g,
        itens: g.itens.filter((i) => (i.soMoney ? canSeeMoney : !i.module || can(i.module))),
      })).filter((g) => g.itens.length > 0),
    [can, canSeeMoney],
  );

  // Qual grupo contém a página atual? É o único que abre por padrão.
  const grupoDaRota = useMemo(() => {
    const path = location.pathname;
    for (const g of grupos) {
      if (g.itens.some((i) => (i.url === "/" ? path === "/" : path.startsWith(i.url)))) return g.id;
    }
    return null;
  }, [grupos, location.pathname]);

  // Acordeão: um grupo aberto por vez. Abrir o próximo fecha o anterior, senão o
  // menu volta a virar a lista comprida que a gente acabou de desfazer.
  const [aberto, setAberto] = useState<string | null>(() => localStorage.getItem(CHAVE_ABERTOS));

  // O grupo da página em que você está fica sempre aberto (senão você não se acha).
  useEffect(() => {
    if (grupoDaRota) setAberto(grupoDaRota);
  }, [grupoDaRota]);

  useEffect(() => {
    if (aberto) localStorage.setItem(CHAVE_ABERTOS, aberto);
    else localStorage.removeItem(CHAVE_ABERTOS);
  }, [aberto]);

  const alternar = (id: string) => setAberto((atual) => (atual === id ? null : id));

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

        {grupos.map((g) => {
          // Menu recolhido (modo ícone): mostra tudo reto, sem cabeçalho de grupo.
          if (collapsed || !g.label) {
            return (
              <SidebarGroup key={g.id}>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {g.itens.map((item) => (
                      <SidebarMenuItem key={item.url}>
                        <SidebarLink item={item} collapsed={collapsed} />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          const estaAberto = aberto === g.id;
          const temAtiva = g.id === grupoDaRota;

          return (
            <SidebarGroup key={g.id} className="py-1">
              <Collapsible open={estaAberto} onOpenChange={() => alternar(g.id)}>
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel
                    className={`flex w-full cursor-pointer items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] transition-colors hover:text-foreground ${
                      temAtiva ? "text-primary" : "text-muted-foreground/70"
                    }`}
                  >
                    <span>{g.label}</span>
                    <span className="flex items-center gap-1.5">
                      {/* Fechado com item ativo dentro? um ponto avisa onde você está. */}
                      {!aberto && temAtiva && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberto ? "" : "-rotate-90"}`} />
                    </span>
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {g.itens.map((item) => (
                        <SidebarMenuItem key={item.url}>
                          <SidebarLink item={item} collapsed={collapsed} />
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </Collapsible>
            </SidebarGroup>
          );
        })}

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
