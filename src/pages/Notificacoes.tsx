import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing, BellOff, Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNotificacoes } from "@/hooks/useNotificacoes";
import { ItemNotificacao } from "@/components/NotificacoesSino";
import { supabase } from "@/integrations/supabase/client";
import {
  ativarPush, desativarPush, pushAtivo, pushSuportado, pushConfigurado, permissaoAtual,
} from "@/lib/push";
import { toast } from "sonner";

export default function Notificacoes() {
  const navigate = useNavigate();
  const { notificacoes, total, isLoading, marcarLidas } = useNotificacoes(100);
  const [pushLigado, setPushLigado] = useState<boolean | null>(null);
  const [mexendo, setMexendo] = useState(false);
  const [testando, setTestando] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "nao_lidas">("todas");

  useEffect(() => {
    pushAtivo().then(setPushLigado).catch(() => setPushLigado(false));
  }, []);

  const alternarPush = async () => {
    setMexendo(true);
    try {
      if (pushLigado) {
        await desativarPush();
        setPushLigado(false);
        toast.success("Notificações desligadas neste navegador");
      } else {
        const r = await ativarPush();
        if (r.ok) {
          setPushLigado(true);
          toast.success("Pronto — os avisos importantes chegam na área de trabalho");
        } else {
          toast.error("Não deu pra ligar", { description: r.motivo });
        }
      }
    } finally {
      setMexendo(false);
    }
  };

  const testar = async () => {
    setTestando(true);
    try {
      // Se a permissão ainda não foi dada, pede agora — senão o balão de
      // primeiro plano nunca aparece por mais que a notificação chegue.
      if (permissaoAtual() === "default" && typeof Notification !== "undefined") {
        await Notification.requestPermission();
      }
      const { error } = await (supabase as any).rpc("notificar_teste");
      if (error) {
        toast.error("Não deu pra testar", { description: error.message });
      } else {
        toast.success("Teste enviado", {
          description:
            permissaoAtual() === "granted"
              ? "Troque de aba ou minimize por 1s — o balão de desktop aparece. Ele também caiu no sino."
              : "Caiu no sino aqui embaixo. Pra ver o balão na área de trabalho, ligue as notificações.",
        });
      }
    } finally {
      setTestando(false);
    }
  };

  const visiveis = filtro === "nao_lidas" ? notificacoes.filter((n) => !n.lida_em) : notificacoes;
  const bloqueado = permissaoAtual() === "denied";

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6">
      <div className="flex items-center gap-3">
        <Bell className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Notificações</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${total} não lida${total > 1 ? "s" : ""}` : "Tudo em dia."}
          </p>
        </div>
        {total > 0 && (
          <Button size="sm" variant="outline" onClick={() => marcarLidas.mutate(undefined)}>
            <Check className="mr-1 h-3.5 w-3.5" /> Marcar todas como lidas
          </Button>
        )}
      </div>

      {/* Área de trabalho */}
      {pushSuportado() && pushConfigurado() && (
        <Card className="glass-card">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-2">
              {pushLigado ? (
                <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">Notificações na área de trabalho</p>
                <p className="text-xs text-muted-foreground">
                  {bloqueado
                    ? "Você bloqueou as notificações pra este site. Libere nas permissões do navegador (o cadeado na barra de endereço)."
                    : pushLigado
                    ? "Ligadas neste navegador — os avisos importantes chegam mesmo com o site fechado."
                    : "Receba prazo estourado, alteração do cliente e proposta aprovada na hora, mesmo com o site fechado."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Teste de um clique: dispara uma notificação pra você mesmo e
                  confere se o balão aparece. Some a dúvida "será que funciona". */}
              <Button size="sm" variant="ghost" onClick={testar} disabled={testando}>
                {testando && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Testar
              </Button>
              {!bloqueado && (
                <Button size="sm" variant={pushLigado ? "outline" : "default"} onClick={alternarPush} disabled={mexendo}>
                  {mexendo && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  {pushLigado ? "Desligar aqui" : "Ligar"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-1.5">
        {([["todas", "Todas"], ["nao_lidas", "Não lidas"]] as const).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFiltro(v)}
            className={`rounded-md px-2.5 py-1 text-xs ${
              filtro === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : visiveis.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {filtro === "nao_lidas" ? "Nenhuma não lida 🎉" : "Nada por aqui ainda."}
            </p>
          ) : (
            visiveis.map((n) => (
              <ItemNotificacao
                key={n.id}
                n={n}
                onClick={() => {
                  marcarLidas.mutate([n.id]);
                  if (n.link) navigate(n.link);
                }}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
