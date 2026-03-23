import {
  Home, DollarSign, Handshake, Calculator, FolderKanban, Map, Settings, LogOut, ChevronDown,
  LayoutDashboard, TrendingUp, Receipt, Target, Vault, Lightbulb, LineChart, CreditCard, RefreshCw, Users,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const financeiroItems = [
  { title: "Visão Geral", url: "/financeiro", icon: LayoutDashboard },
  { title: "Fluxo de Caixa", url: "/fluxo-de-caixa", icon: TrendingUp },
  { title: "Custos", url: "/custos", icon: Receipt },
  { title: "Resultados & Metas", url: "/resultados-metas", icon: Target },
  { title: "Caixa & Runway", url: "/caixa-runway", icon: Vault },
  { title: "Insights", url: "/insights", icon: Lightbulb },
  { title: "Projeções 2026", url: "/projecoes-2026", icon: LineChart },
  { title: "Contas a Pagar", url: "/contas-a-pagar", icon: CreditCard },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, user, profile } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const isFinanceiroActive = financeiroItems.some((i) => location.pathname === i.url);
  const [financeiroOpen, setFinanceiroOpen] = useState(isFinanceiroActive);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("ca-sync-full");
      if (error) {
        toast({ title: "Erro ao sincronizar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Sincronizado com sucesso!" });
      }
    } catch {
      toast({ title: "Erro ao sincronizar", description: "Erro inesperado.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "";
  const avatarUrl = profile?.avatar_url || "";
  const initials = displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <span className="text-lg font-bold text-primary">A</span>
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-sm font-bold text-foreground tracking-tight">Adverse OS</h2>
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Home */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/" end className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-primary font-medium">
                    <Home className="mr-2 h-4 w-4" />
                    {!collapsed && <span>Home</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Financeiro - collapsible */}
              <SidebarMenuItem>
                <Collapsible open={financeiroOpen} onOpenChange={setFinanceiroOpen}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton className={`hover:bg-sidebar-accent/50 w-full ${isFinanceiroActive ? "text-primary font-medium" : ""}`}>
                      <DollarSign className="mr-2 h-4 w-4" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 text-left">Financeiro</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${financeiroOpen ? "rotate-180" : ""}`} />
                        </>
                      )}
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenu className="ml-4 border-l border-sidebar-border pl-2">
                      {financeiroItems.map((item) => (
                        <SidebarMenuItem key={item.url}>
                          <SidebarMenuButton asChild>
                            <NavLink to={item.url} className="hover:bg-sidebar-accent/50 text-sm" activeClassName="bg-sidebar-accent text-primary font-medium">
                              <item.icon className="mr-2 h-3.5 w-3.5" />
                              {!collapsed && <span>{item.title}</span>}
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>

              {/* Comercial */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/comercial" className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-primary font-medium">
                    <Handshake className="mr-2 h-4 w-4" />
                    {!collapsed && <span>Comercial</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Orçamentos */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/orcamentos" className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-primary font-medium">
                    <Calculator className="mr-2 h-4 w-4" />
                    {!collapsed && <span>Orçamentos</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Projetos (disabled) */}
              <SidebarMenuItem>
                <SidebarMenuButton disabled className="opacity-50 cursor-not-allowed">
                  <FolderKanban className="mr-2 h-4 w-4" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">Projetos</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-muted-foreground/30 text-muted-foreground">
                        em breve
                      </Badge>
                    </>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Mapa Operacional */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/mapa-operacional" className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-primary font-medium">
                    <Map className="mr-2 h-4 w-4" />
                    {!collapsed && <span>Mapa Operacional</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Configurações */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/configuracoes" className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-primary font-medium">
                    <Settings className="mr-2 h-4 w-4" />
                    {!collapsed && <span>Configurações</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3 space-y-1">
        <SidebarMenuButton onClick={handleSync} disabled={syncing} className="hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground">
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {!collapsed && <span>{syncing ? "Sincronizando..." : "Sincronizar"}</span>}
        </SidebarMenuButton>

        {!collapsed && (
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <Avatar className="h-7 w-7">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="bg-secondary text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{displayName}</p>
              <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        )}

        <SidebarMenuButton onClick={signOut} className="hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground">
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
