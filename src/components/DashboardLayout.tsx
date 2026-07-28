import { ReactNode, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Play, Square, LogOut, ShieldCheck, XCircle, Sun, Moon, Eye, EyeOff } from "lucide-react";
import { useValoresOcultos } from "@/contexts/PrivacidadeContext";
import { NotificacoesSino } from "@/components/NotificacoesSino";
import { AvisoNovaVersao } from "@/components/AvisoNovaVersao";
import { sincronizarPush } from "@/lib/push";
import { BuscaGlobal } from "@/components/BuscaGlobal";
import { useTema } from "@/hooks/useTema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimer, formatElapsed } from "@/contexts/TimerContext";
import { StartTimerModal } from "@/components/timer/StartTimerModal";
import { AssistenteFlutuante } from "@/components/AssistenteFlutuante";

function TimerButton() {
  const { sessao, stop, cancel, elapsedSec } = useTimer();
  const [open, setOpen] = useState(false);

  // Timer rodando → mostra o cronômetro ativo (parar de qualquer tela).
  if (sessao) {
    // Enquanto roda, o cronômetro é o atalho pro que está sendo feito: clicar
    // abre o entregável. Parar ficou no ícone ao lado — antes o clique no chip
    // inteiro parava e lançava, então não dava pra usar como link.
    const destino = sessao.deliverable_id && sessao.project_id
      ? `/projetos/${sessao.project_id}/entregaveis/${sessao.deliverable_id}`
      : sessao.project_id ? `/projetos/${sessao.project_id}` : null;
    const rotulo = (
      <>
        <span className="tabular-nums">{formatElapsed(elapsedSec)}</span>
        <span className="hidden max-w-[180px] truncate text-[10px] opacity-80 md:inline">
          · {sessao.project_name}
          {sessao.task_title ? ` · ${sessao.task_title}` : ""}
        </span>
      </>
    );
    return (
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-2 rounded-lg bg-warning py-1.5 pl-2.5 pr-3 text-sm font-medium text-warning-foreground">
          <button onClick={stop} title="Parar e lançar as horas" className="shrink-0 hover:opacity-70">
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
          {destino ? (
            <Link to={destino} className="flex items-center gap-2 hover:underline" title="Abrir o entregável">
              {rotulo}
            </Link>
          ) : (
            <span className="flex items-center gap-2">{rotulo}</span>
          )}
        </div>
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

  // Parado → botão Apontar (abre o modal que obriga escolher um entregável).
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        title="Apontar horas num entregável"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        <span>Apontar</span>
      </button>
      <StartTimerModal open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Só admin: esconde/mostra TODOS os valores em R$ (modo apresentação p/ o time). */
function ValoresBotao() {
  const { isAdmin } = usePermissions();
  const { ocultar, alternar } = useValoresOcultos();
  if (!isAdmin) return null;
  return (
    <button
      onClick={alternar}
      title={ocultar ? "Valores ocultos — clique pra mostrar" : "Ocultar valores (modo apresentação)"}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
        ocultar
          ? "border-amber-500/40 bg-amber-500/15 text-warning"
          : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      {ocultar ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Alterna claro/escuro. Fica salvo por máquina. */
function TemaBotao() {
  const { claro, alternar } = useTema();
  return (
    <button
      onClick={alternar}
      title={claro ? "Mudar para o modo escuro" : "Mudar para o modo claro"}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:text-foreground"
    >
      {claro ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
    </button>
  );
}

function UserChip() {
  const { user, profile, signOut } = useAuth();
  const { isAdmin, isProdutor, isCliente, isEdicao } = usePermissions();
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  // Mostra o papel de verdade (antes era hardcoded Admin/Equipe — enganava).
  const role = isAdmin ? "Admin" : isProdutor ? "Produtor" : isCliente ? "Cliente" : isEdicao ? "Edição" : "Equipe";

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

// Barra proeminente em TODAS as telas quando um cronômetro está rodando.
function TimerBar() {
  const { sessao, stop, cancel, elapsedSec } = useTimer();
  if (!sessao) return null;
  return (
    <div className="sticky top-14 z-10 flex items-center gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm backdrop-blur">
      <span className="flex shrink-0 items-center gap-2 font-semibold text-warning">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
        </span>
        Gravando
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">
        {sessao.project_name}
        {sessao.task_title ? ` · ${sessao.task_title}` : ""}
      </span>
      <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatElapsed(elapsedSec)}</span>
      <button
        onClick={stop}
        className="flex shrink-0 items-center gap-1 rounded-md bg-warning px-2.5 py-1 text-xs font-semibold text-warning-foreground hover:bg-warning/90"
      >
        <Square className="h-3 w-3 fill-current" /> Parar e lançar
      </button>
      <button onClick={cancel} className="shrink-0 text-muted-foreground hover:text-destructive" title="Cancelar sem lançar">
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  // Reconcilia a assinatura de push com o banco a cada carga. Conserta
  // sozinho quem "tem permissão ligada" mas sumiu do servidor — endpoint
  // que expirou, ou upsert que falhou no dia em que a pessoa clicou Ligar.
  useEffect(() => { void sincronizarPush(); }, []);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger />
            <BuscaGlobal />
            <div className="ml-auto flex items-center gap-2">
              <TimerButton />
              <ValoresBotao />
              <TemaBotao />
              <NotificacoesSino />
              <UserChip />
            </div>
          </header>
          <TimerBar />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
      <AssistenteFlutuante />
      {/* Deploy novo não chega sozinho numa aba já aberta — isto avisa. */}
      <AvisoNovaVersao />
    </SidebarProvider>
  );
}
