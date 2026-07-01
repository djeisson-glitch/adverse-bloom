import { ReactNode, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Play, Square, Search, Bell, LogOut, ShieldCheck, XCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimer, formatElapsed } from "@/contexts/TimerContext";
import { StartTimerModal } from "@/components/timer/StartTimerModal";
import { toast } from "sonner";

function TimerButton() {
  const { sessao, stop, cancel, elapsedSec } = useTimer();
  const [open, setOpen] = useState(false);

  if (sessao) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={stop}
          className="flex items-center gap-2 rounded-lg bg-warning px-3 py-1.5 text-sm font-medium text-warning-foreground hover:bg-warning/90"
          title={`Rodando em ${sessao.project_name} — clique pra parar e lançar`}
        >
          <Square className="h-3.5 w-3.5 fill-current" />
          <span className="tabular-nums">{formatElapsed(elapsedSec)}</span>
          <span className="hidden max-w-[120px] truncate text-[10px] opacity-80 md:inline">
            · {sessao.project_name}
          </span>
        </button>
        <button
          onClick={cancel}
          className="text-muted-foreground hover:text-destructive"
          title="Cancelar sem lançar"
        >
          <XCircle className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        title="Apontar horas em qualquer tela"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        <span>Apontar</span>
      </button>
      <StartTimerModal open={open} onOpenChange={setOpen} />
    </>
  );
}

function SearchBox() {
  return (
    <div className="relative hidden max-w-md flex-1 md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        placeholder="Buscar projeto, cliente, orçamento…"
        className="w-full rounded-lg border border-border bg-muted/40 py-1.5 pl-9 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        onFocus={(e) => {
          e.target.blur();
          toast.info("Busca global chega em melhoria futura");
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        ⌘K
      </span>
    </div>
  );
}

function UserChip() {
  const { user, profile, signOut } = useAuth();
  const { isAdmin } = usePermissions();
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const role = isAdmin ? "Admin" : "Equipe";

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1">
        <Avatar className="h-6 w-6">
          <AvatarImage src={profile?.avatar_url || ""} />
          <AvatarFallback className="bg-secondary text-[10px]">{initials}</AvatarFallback>
        </Avatar>
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-xs font-medium leading-tight text-foreground">{displayName}</p>
          <p className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground">
            {isAdmin && <ShieldCheck className="h-2.5 w-2.5 text-primary" />}
            {role}
          </p>
        </div>
      </div>
      <button
        onClick={signOut}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        title="Sair"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Sair</span>
      </button>
    </div>
  );
}

function NotificationBell() {
  return (
    <button
      onClick={() => toast.info("Notificações chegam junto dos follow-ups")}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:text-foreground"
      title="Notificações"
    >
      <Bell className="h-3.5 w-3.5" />
    </button>
  );
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger />
            <SearchBox />
            <div className="ml-auto flex items-center gap-2">
              <TimerButton />
              <NotificationBell />
              <UserChip />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
