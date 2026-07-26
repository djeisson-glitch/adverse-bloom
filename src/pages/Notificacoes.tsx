import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing, BellOff, Check, Loader2, Volume2, VolumeX, Monitor } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNotificacoes, SOM_CHAVE, somLigado, tocarAviso } from "@/hooks/useNotificacoes";
import { ItemNotificacao } from "@/components/NotificacoesSino";
import { InstalarApp } from "@/components/InstalarApp";
import { PreferenciasNotificacao } from "@/components/notificacoes/PreferenciasNotificacao";
import { useTiposNotif, ROTULO_NIVEL } from "@/hooks/useNotifPrefs";
import { supabase } from "@/integrations/supabase/client";
import {
  ativarPush, desativarPush, pushAtivo, pushSuportado, pushConfigurado, permissaoAtual,
} from "@/lib/push";
import { toast } from "sonner";

/**
 * Quando o push "não chega com tudo fechado", quase nunca é o Adverse OS: é o
 * sistema operacional segurando o navegador. Detecta o SO e mostra só o passo
 * que serve pra aquela máquina, em vez de um texto genérico.
 */
function AjudaSistema() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const mac = /Macintosh|Mac OS X/i.test(ua);
  const win = /Windows/i.test(ua);
  if (!mac && !win) return null;

  return (
    <Card className="glass-card">
      <CardContent className="flex items-start gap-2 p-4">
        <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Não está chegando com o sistema fechado?</p>
          {mac ? (
            <p className="text-xs text-muted-foreground">
              No macOS, abra <strong className="text-foreground">Ajustes do Sistema → Notificações</strong>, escolha o
              navegador (ou o <strong className="text-foreground">Adverse OS</strong>, se você instalou como app) e deixe
              &quot;Permitir notificações&quot; ligado. Confira também se o <strong className="text-foreground">Foco</strong> /
              Não Perturbe do Mac não está ativo — ele segura tudo antes de chegar aqui.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No Windows, abra <strong className="text-foreground">Configurações → Sistema → Notificações</strong> e deixe
              o navegador (ou o <strong className="text-foreground">Adverse OS</strong>, se instalou como app) ligado.
              Confira também o <strong className="text-foreground">Assistente de Foco</strong>: com ele ativo, o Windows
              não mostra nada.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            E o essencial: o computador precisa estar <strong className="text-foreground">ligado e com o navegador
            aberto em segundo plano</strong> (a janela pode estar fechada). Máquina desligada não recebe — a notificação
            fica esperando aqui na central.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Notificacoes() {
  const navigate = useNavigate();
  const { notificacoes, total, isLoading, marcarLidas } = useNotificacoes(100);
  const [pushLigado, setPushLigado] = useState<boolean | null>(null);
  const [mexendo, setMexendo] = useState(false);
  const [testando, setTestando] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "nao_lidas">("todas");
  const [nivel, setNivel] = useState<number | null>(null);
  const [tipo, setTipo] = useState<string>("");
  const [som, setSom] = useState(somLigado());
  const { data: tipos = [] } = useTiposNotif();

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
      // Pede a permissão se ainda não foi dada.
      let permissao = permissaoAtual();
      if (permissao === "default" && typeof Notification !== "undefined") {
        permissao = await Notification.requestPermission();
      }

      // Mostra o balão NA HORA, mesmo com a aba em foco. É teste explícito: a
      // pessoa quer ver agora, não trocar de aba. (No fluxo real o balão só
      // aparece quando a aba não está em foco, pra não virar ruído.)
      if (permissao === "granted" && typeof Notification !== "undefined") {
        try {
          new Notification("Notificação de teste ✅", {
            body: "Se você está vendo isto, as notificações estão funcionando.",
            icon: "/favicon.ico",
            tag: `teste-${Date.now()}`, // única: dois testes seguidos não se sobrepõem
          });
        } catch {
          /* alguns navegadores só via service worker — aí vale o push */
        }
      }

      // E cria a notificação de verdade (exercita banco → realtime → sino, e o
      // push pra quem tem a aba fechada).
      const { error } = await (supabase as any).rpc("notificar_teste");
      if (error) {
        toast.error("Não deu pra testar", { description: error.message });
      } else if (permissao === "granted") {
        toast.success("Balão disparado — apareceu na área de trabalho?");
      } else if (permissao === "denied") {
        toast.error("Notificações bloqueadas", {
          description: "Libere no cadeado da barra de endereço (e no macOS: Ajustes → Notificações → o navegador).",
        });
      } else {
        toast.success("Caiu no sino aqui embaixo", {
          description: "Pra ver o balão na área de trabalho, clique em Ligar.",
        });
      }
    } finally {
      setTestando(false);
    }
  };

  // Só os tipos que realmente apareceram no feed viram opção de filtro — um
  // select com 15 tipos onde 12 não têm nenhuma linha só atrapalha.
  const tiposPresentes = useMemo(() => {
    const vistos = new Set(notificacoes.map((n) => n.tipo));
    return tipos.filter((t) => vistos.has(t.tipo));
  }, [tipos, notificacoes]);

  const visiveis = useMemo(
    () =>
      notificacoes.filter((n) => {
        if (filtro === "nao_lidas" && n.lida_em) return false;
        if (nivel && (n as any).nivel !== nivel) return false;
        if (tipo && n.tipo !== tipo) return false;
        return true;
      }),
    [notificacoes, filtro, nivel, tipo],
  );
  const filtrando = filtro === "nao_lidas" || nivel !== null || !!tipo;
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

      {/* Instalar como app — no computador vira janela própria com ícone no dock */}
      <InstalarApp />

      {/* Som: no computador é o que mais chama quando a pessoa está em outra janela */}
      <Card className="glass-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-2">
            {som ? <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <VolumeX className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            <div>
              <p className="text-sm font-medium text-foreground">Som ao chegar notificação</p>
              <p className="text-xs text-muted-foreground">Toque curto quando algo importante chega. Só nesta máquina.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { localStorage.setItem(SOM_CHAVE, "on"); tocarAviso(); }}>
              Ouvir
            </Button>
            <Button
              size="sm"
              variant={som ? "outline" : "default"}
              onClick={() => {
                const novo = !som;
                localStorage.setItem(SOM_CHAVE, novo ? "on" : "off");
                setSom(novo);
                if (novo) tocarAviso();
              }}
            >
              {som ? "Silenciar" : "Ativar som"}
            </Button>
          </div>
        </CardContent>
      </Card>

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

      {/* Por que às vezes não chega com tudo fechado: quase sempre é o
          sistema operacional silenciando o navegador, não o Adverse OS. */}
      <AjudaSistema />

      {/* O que cada um recebe, horários do resumo e não perturbe */}
      <PreferenciasNotificacao />

      <div className="flex flex-wrap items-center gap-1.5">
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

        <span className="mx-1 h-4 w-px bg-border/60" />

        {[1, 2, 3].map((n) => (
          <button
            key={n}
            onClick={() => setNivel(nivel === n ? null : n)}
            className={`rounded-md px-2.5 py-1 text-xs ${
              nivel === n ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {ROTULO_NIVEL[n]}
          </button>
        ))}

        {tiposPresentes.length > 1 && (
          <select
            className="ml-auto h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="">Todos os tipos</option>
            {tiposPresentes.map((t) => (
              <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>
            ))}
          </select>
        )}
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : visiveis.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {filtrando ? "Nada com esse filtro." : "Nada por aqui ainda."}
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
