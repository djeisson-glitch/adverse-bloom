import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  Clapperboard,
  ClipboardList,
  CreditCard,
  FileText,
  Gauge,
  History,
  Home,
  Inbox,
  LayoutGrid,
  Lightbulb,
  LineChart,
  ListChecks,
  LogOut,
  PackageCheck, Package,
  Plus,
  Receipt,
  Scale,
  Send,
  Settings2,
  Sprout,
  Target,
  Timer,
  TrendingUp,
  TrendingUp as TrendingUpFin,
  Truck,
  Users,
  UsersRound,
  Vault,
  Video,
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
import { LogoAdverse } from "@/components/LogoAdverse";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  module?: ModuleId;   // sem módulo = qualquer pessoa logada
  soMoney?: boolean;   // só aparece pra quem vê dinheiro (visões de gestão)
  /**
   * Casa só a URL exata, nunca por prefixo. Necessário para item que é índice
   * de uma área: "/financeiro" é prefixo de "/financeiro/dre", então sem isto
   * ele ficaria aceso em toda sub-rota e o grupo dele roubaria a abertura
   * automática dos outros grupos.
   */
  exact?: boolean;
};

type NavGrupo = {
  id: string;        // chave do estado aberto/fechado
  label?: string;    // sem label = grupo fixo do topo (não colapsa)
  itens: NavItem[];
};

/**
 * O menu é agrupado pela PERGUNTA que a pessoa está se fazendo, não pelo acaso
 * histórico. Antes "Produção" era um saco de gatos: misturava comercial
 * (Demandas, Orçamentos), execução (Projetos, Ilha de edição), tempo (Horas, Timesheet)
 * e planejamento (Capacidade, Previsão) — 15 itens sem parentesco nenhum.
 */
const GRUPOS: NavGrupo[] = [
  {
    id: "topo",
    itens: [
      { title: "Início", url: "/", icon: Home, exact: true },
      { title: "Minha mesa", url: "/minha-mesa", icon: ClipboardList },
    ],
  },
  {
    id: "producao",
    label: "Produção",
    itens: [
      { title: "Projetos", url: "/projetos", icon: LayoutGrid, module: "projetos" },
      { title: "Ilha de edição", url: "/pos-producao", icon: Clapperboard, module: "pos_producao" },
      { title: "Entregas do mês", url: "/entregas", icon: PackageCheck, module: "projetos" },
      { title: "Saídas de produção", url: "/saidas", icon: Video, module: "calendario" },
      { title: "Calendário", url: "/calendario", icon: CalendarDays, module: "calendario" },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    itens: [
      { title: "Demandas", url: "/demandas", icon: Inbox, module: "demandas" },
      { title: "Orçamentos", url: "/orcamentos", icon: ClipboardList, module: "orcamentos" },
      { title: "Clientes", url: "/clientes", icon: Users, module: "clientes" },
      { title: "Follow-ups", url: "/follow-ups", icon: CalendarRange, module: "follow_ups" },
    ],
  },
  {
    id: "tempo",
    label: "Tempo",
    itens: [
      { title: "Horas", url: "/horas", icon: Timer, module: "horas" },
      { title: "Capacidade", url: "/capacidade", icon: Gauge, module: "capacidade", soMoney: true },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    itens: [
      { title: "O mês", url: "/financeiro", icon: Target, module: "financeiro", exact: true },
      { title: "Lançamentos", url: "/financeiro/lancamentos", icon: Plus, module: "financeiro" },
      { title: "Metas", url: "/financeiro/metas", icon: LineChart, module: "financeiro" },
      { title: "Fluxo de caixa", url: "/financeiro/fluxo", icon: TrendingUpFin, module: "financeiro" },
      { title: "Contas a pagar", url: "/financeiro/contas", icon: CreditCard, module: "financeiro" },
    ],
  },
  {
    id: "faturamento",
    label: "Faturamento",
    itens: [
      { title: "Faturamento do mês", url: "/faturamento-mensal", icon: Receipt, module: "faturamento" },
      { title: "Fechamento", url: "/fechamento", icon: Scale, module: "fechamento" },
    ],
  },
  {
    id: "analise",
    label: "Análise",
    itens: [
      { title: "DRE gerencial", url: "/financeiro/dre", icon: FileText, module: "financeiro" },
      { title: "Custos", url: "/financeiro/custos", icon: Receipt, module: "financeiro" },
      { title: "Insights", url: "/financeiro/insights", icon: Lightbulb, module: "financeiro" },
    ],
  },
  {
    id: "ajustes",
    label: "Ajustes",
    itens: [
      { title: "Time", url: "/time", icon: UsersRound, module: "time" },
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
        end={item.url === "/" || !!item.exact}
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
      if (g.itens.some((i) => (i.url === "/" || i.exact ? path === i.url : path.startsWith(i.url)))) return g.id;
    }
    return null;
  }, [grupos, location.pathname]);

  /**
   * Quantos grupos quiser abertos ao mesmo tempo.
   *
   * Era acordeão — abrir um fechava o outro. A intenção era não deixar o menu
   * virar uma lista comprida, mas quem trabalha em duas frentes ao mesmo tempo
   * (Comercial e Produção, por exemplo) reabria o mesmo grupo o dia inteiro. A
   * lista comprida é escolha de quem a abriu; fechar sozinho não é.
   *
   * Guarda a lista, não um id. A chave antiga guardava uma string solta, então
   * quem já usa o sistema tem esse valor salvo — ele é aceito como grupo único
   * em vez de virar menu todo fechado no primeiro carregamento.
   */
  const [abertos, setAbertos] = useState<string[]>(() => {
    const salvo = localStorage.getItem(CHAVE_ABERTOS);
    if (!salvo) return [];
    try {
      const v = JSON.parse(salvo);
      return Array.isArray(v) ? v : [String(v)];
    } catch {
      return [salvo];   // formato antigo: um id cru
    }
  });

  // O grupo da página em que você está abre sozinho — e os outros ficam como
  // estavam. Antes isto fechava todo o resto a cada navegação.
  useEffect(() => {
    if (grupoDaRota) setAbertos((a) => (a.includes(grupoDaRota) ? a : [...a, grupoDaRota]));
  }, [grupoDaRota]);

  useEffect(() => {
    localStorage.setItem(CHAVE_ABERTOS, JSON.stringify(abertos));
  }, [abertos]);

  const alternar = (id: string) =>
    setAbertos((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

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
          {collapsed ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <span className="text-lg font-bold text-primary">A</span>
            </div>
          ) : (
            <div className="min-w-0">
              <LogoAdverse className="h-5 text-foreground" />
              <p className="mt-1.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
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

          const estaAberto = abertos.includes(g.id);
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
                      {/* `estaAberto`, não o estado global: com um id só, a seta
                          de TODOS os grupos girava junto quando qualquer um
                          abria, e o ponto de "você está aqui" sumia de todos. */}
                      {!estaAberto && temAtiva && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${estaAberto ? "" : "-rotate-90"}`} />
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
