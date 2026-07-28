import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pushAtivo, pushSuportado, pushConfigurado, permissaoAtual, sincronizarPush } from "@/lib/push";
import { toast } from "sonner";

type Estado = { permissao: string; assinatura: boolean | null; ultimo: string | null; instalado: boolean };

/**
 * Diagnóstico de entrega — por que "às vezes não chega".
 *
 * O servidor está entregando (medido em 28/07/2026: zero avisos de nível 1 e 2
 * presos, em todo mundo). O que falha é do "push enviado" pra frente: navegador
 * fechado, macOS bloqueando o Chrome, Foco ligado. Nada disso é visível do
 * servidor — e por isso a reclamação nunca virava causa.
 *
 * Os dois testes separam justamente isso:
 *  • o LOCAL não passa pela internet. Se ele não aparece, quem está barrando é
 *    o sistema operacional — não adianta trocar de canal.
 *  • o REAL faz a volta inteira pelo servidor. Se o local aparece e o real
 *    não, o problema é assinatura/entrega.
 */
export function DiagnosticoEntrega() {
  const [e, setE] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const ler = async () => {
    const { data } = await (supabase as any)
      .from("push_alcance").select("ultimo_push, dispositivos").maybeSingle();
    setE({
      permissao: permissaoAtual(),
      assinatura: await pushAtivo().catch(() => false),
      ultimo: data?.ultimo_push || null,
      // App instalado (PWA): o navegador roda em janela própria e a entrega
      // com a janela fechada melhora bastante.
      instalado: window.matchMedia("(display-mode: standalone)").matches,
    });
  };
  useEffect(() => { void ler(); }, []);

  if (!pushSuportado() || !pushConfigurado() || !e) return null;

  const testeLocal = async () => {
    setOcupado("local");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) throw new Error("service worker não registrado");
      await reg.showNotification("Teste local ✅", {
        body: "Este aviso não passou pela internet. Se você o vê, o sistema operacional está deixando passar.",
        icon: "/icon-192.png",
        requireInteraction: true,
        tag: "teste-local",
      });
      toast.info("Disparado — apareceu na sua área de trabalho?");
    } catch (err: any) {
      toast.error("Não deu", { description: err.message });
    } finally { setOcupado(null); }
  };

  const testeReal = async () => {
    setOcupado("real");
    try {
      await sincronizarPush();   // conserta assinatura morta antes de testar
      const { data, error } = await (supabase as any).rpc("testar_entrega_push");
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.motivo || "não deu pra disparar");
      toast.info("Disparado pelo servidor — deve chegar em até 10 segundos");
      setTimeout(() => void ler(), 6000);
    } catch (err: any) {
      toast.error("Não deu", { description: err.message });
    } finally { setOcupado(null); }
  };

  const Linha = ({ ok, label, detalhe }: { ok: boolean; label: string; detalhe?: string }) => (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <Check className="h-4 w-4 shrink-0 text-success" /> : <X className="h-4 w-4 shrink-0 text-destructive" />}
      <span className="text-foreground">{label}</span>
      {detalhe && <span className="text-xs text-muted-foreground">· {detalhe}</span>}
    </div>
  );

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Entrega neste computador</p>
        </div>

        <div className="space-y-1.5">
          <Linha ok={e.permissao === "granted"} label="Permissão do navegador"
            detalhe={e.permissao === "denied" ? "bloqueada — libere no cadeado da barra de endereço" : e.permissao} />
          <Linha ok={!!e.assinatura} label="Assinatura no servidor"
            detalhe={e.assinatura ? "viva" : "sem assinatura"} />
          <Linha ok={!!e.ultimo} label="Último aviso entregue"
            detalhe={e.ultimo ? new Date(e.ultimo).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "nunca"} />
          <Linha ok={e.instalado} label="Aberto como aplicativo"
            detalhe={e.instalado ? "sim" : "não — no Chrome: ⋮ › Instalar. Melhora a entrega com a janela fechada"} />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={testeLocal} disabled={!!ocupado}>
            {ocupado === "local" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Testar sem internet
          </Button>
          <Button size="sm" onClick={testeReal} disabled={!!ocupado}>
            {ocupado === "real" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Testar entrega de verdade
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Se o <strong>teste sem internet</strong> não aparecer, quem está barrando é o seu macOS/Windows
          (Ajustes → Notificações → Chrome, ou o modo Foco) — trocar de canal não resolveria.
          Se ele aparecer e o <strong>de verdade</strong> não, o problema é da assinatura, e aí é comigo.
        </p>
      </CardContent>
    </Card>
  );
}
