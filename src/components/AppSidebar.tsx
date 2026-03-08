import { LayoutDashboard, FolderKanban, Users, TrendingUp, Receipt, LogOut, Film } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
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

const items = [
  { title: "Visão Geral", url: "/", icon: LayoutDashboard },
  { title: "Projetos", url: "/projetos", icon: FolderKanban },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Fluxo de Caixa", url: "/fluxo-de-caixa", icon: TrendingUp },
  { title: "Custos", url: "/custos", icon: Receipt },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, user } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className={`flex items-center gap-3 px-4 py-5 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Film className="h-5 w-5 text-primary" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="font-heading text-sm font-bold text-foreground">Adverse</h2>
              <p className="text-xs text-muted-foreground">Financeiro</p>
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && user && (
          <p className="mb-2 truncate px-2 text-xs text-muted-foreground">{user.email}</p>
        )}
        <SidebarMenuButton onClick={signOut} className="hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground">
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
