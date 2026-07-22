import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Bell, BellRing, Check, AlertTriangle, Sparkles } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { useNotificacoes, type Notificacao } from "@/hooks/useNotificacoes";
import { useSinalAba } from "@/hooks/useSinalAba";
import { ativarPush, pushAtivo, pushSuportado, pushConfigurado, permissaoAtual } from "@/lib/push";
import { toast } from "sonner";

/** Sino do header: contador ao vivo (Realtime) + as últimas notificações. */
export function NotificacoesSino() {
  const navigate = useNavigate();
  const { notificacoes, total, marcarLidas } = useNotificacoes(10);
  const [pushLigado, setPushLigado] = useState<boolean | null>(null);
  // Marca a aba (título + favicon) — o sino mora no header de todas as telas.
  useSinalAba(total);

  useEffect(() => {
    pushAtivo().then(setPushLigado).catch(() => setPushLigado(false));
  }, []);

  // Oferece o push só pra quem ainda não ligou e não bloqueou de propósito.
  const podeOferecerPush =
    pushSuportado() && pushConfigurado() && pushLigado === false && permissaoAtual() !== "denied";

  const ligarPush = async () => {
    const r = await ativarPush();
    if (r.ok) {
      setPushLigado(true);
      toast.success("Notificações ligadas", {
        description: "Você vai receber os avisos importantes na área de trabalho, mesmo com o site fechado.",
      });
    } else {
      toast.error("Não deu pra ligar", { description: r.motivo });
    }
  };

  const abrir = (n: Notificacao) => {
    marcarLidas.mutate([n.id]);
    if (n.link) navigate(n.link);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:text-foreground"
          title="Notificações"
        >
          {total > 0 ? <BellRing className="h-3.5 w-3.5 text-primary" /> : <Bell className="h-3.5 w-3.5" />}
          {total > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-sm font-semibold text-foreground">Notificações</span>
          {total > 0 && (
            <button
              onClick={() => marcarLidas.mutate(undefined)}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Check className="h-3 w-3" /> marcar todas como lidas
            </button>
          )}
        </div>

        {podeOferecerPush && (
          <button
            onClick={ligarPush}
            className="flex w-full items-start gap-2 border-b border-border/60 bg-primary/[0.05] px-3 py-2.5 text-left hover:bg-primary/10"
          >
            <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-xs text-foreground">
              <strong>Receber na área de trabalho</strong>
              <span className="block text-muted-foreground">
                Avisos importantes chegam mesmo com o site fechado.
              </span>
            </span>
          </button>
        )}

        <div className="max-h-96 overflow-y-auto">
          {notificacoes.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nada por aqui 🎉</p>
          ) : (
            notificacoes.map((n) => <ItemNotificacao key={n.id} n={n} onClick={() => abrir(n)} />)
          )}
        </div>

        <Link
          to="/notificacoes"
          className="block border-t border-border/60 px-3 py-2 text-center text-xs text-primary hover:underline"
        >
          Ver todas
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ItemNotificacao({ n, onClick }: { n: Notificacao; onClick: () => void }) {
  const critico = n.prioridade === "critico";
  const Icone = n.tipo === "digest" ? Sparkles : critico ? AlertTriangle : Bell;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-2 border-b border-border/40 px-3 py-2.5 text-left last:border-0 hover:bg-muted/40 ${
        n.lida_em ? "opacity-60" : ""
      }`}
    >
      <Icone className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${critico ? "text-destructive" : "text-primary"}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{n.titulo}</span>
        {n.corpo && (
          <span className="block whitespace-pre-wrap text-[11px] leading-snug text-muted-foreground">
            {n.corpo}
          </span>
        )}
        <span className="mt-0.5 block text-[10px] text-muted-foreground/70">{tempoRelativo(n.created_at)}</span>
      </span>
      {!n.lida_em && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
    </button>
  );
}

export function tempoRelativo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `${d} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
