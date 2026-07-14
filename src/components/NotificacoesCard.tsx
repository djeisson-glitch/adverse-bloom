import { useNavigate, Link } from "react-router-dom";
import { Bell, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNotificacoes } from "@/hooks/useNotificacoes";
import { ItemNotificacao } from "@/components/NotificacoesSino";

/** Visão de notificações na Home — as não lidas, direto na cara. */
export function NotificacoesCard({ limite = 4 }: { limite?: number }) {
  const navigate = useNavigate();
  const { notificacoes, total, marcarLidas } = useNotificacoes(20);

  // Na Home mostramos o que ainda não foi visto; se não há nada, não ocupamos espaço.
  const naoLidas = notificacoes.filter((n) => !n.lida_em).slice(0, limite);
  if (naoLidas.length === 0) return null;

  return (
    <Card className="glass-card border-primary/25">
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Bell className="h-4 w-4 text-primary" /> Novidades
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {total}
            </span>
          </p>
          <Link to="/notificacoes" className="flex items-center gap-1 text-xs text-primary hover:underline">
            Ver todas <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {naoLidas.map((n) => (
          <ItemNotificacao
            key={n.id}
            n={n}
            onClick={() => {
              marcarLidas.mutate([n.id]);
              if (n.link) navigate(n.link);
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}
