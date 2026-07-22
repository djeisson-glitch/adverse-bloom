import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, Check, Share } from "lucide-react";

/**
 * Instalar o Adverse OS como app (PWA).
 *
 * Isto NÃO é enfeite: com o app instalado, o push chega pelo celular mesmo com
 * o navegador do computador fechado. E no iPhone o Web Push SÓ funciona com o
 * app na tela de início (iOS 16.4+) — por isso a instrução manual ali embaixo,
 * já que o iOS não oferece o botão de instalar.
 */
export function InstalarApp() {
  const [prompt, setPrompt] = useState<any>(null);
  const [instalado, setInstalado] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setInstalado(!!standalone);

    const aoPrompt = (e: any) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", aoPrompt);
    const aoInstalar = () => { setInstalado(true); setPrompt(null); };
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPrompt);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  const ehIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (instalado) {
    return (
      <Card className="glass-card border-success/30">
        <CardContent className="flex items-center gap-2 p-4 text-sm">
          <Check className="h-4 w-4 shrink-0 text-success" />
          <span className="text-foreground">App instalado — os avisos chegam mesmo com o navegador fechado.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-primary/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Instale o app no celular</p>
            <p className="text-xs text-muted-foreground">
              Instalado, o aviso chega no telefone mesmo com o computador desligado.
              {ehIOS && " No iPhone, é o único jeito de receber notificação."}
            </p>
          </div>
        </div>

        {prompt ? (
          <Button
            size="sm"
            onClick={async () => { prompt.prompt(); await prompt.userChoice; setPrompt(null); }}
          >
            Instalar agora
          </Button>
        ) : ehIOS ? (
          <p className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            No Safari: toque em <Share className="mx-0.5 inline h-3.5 w-3.5" /> <b className="text-foreground">Compartilhar</b>
            → <b className="text-foreground">Adicionar à Tela de Início</b>.
          </p>
        ) : (
          <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            No Chrome do celular: menu <b className="text-foreground">⋮</b> → <b className="text-foreground">Instalar app</b>.
            No computador, o ícone de instalar aparece na barra de endereço.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
