import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Avisa quando saiu versão nova do sistema.
 *
 * O problema: isto é uma SPA. O navegador baixa `index-HASH.js` uma vez e a
 * aba roda AQUELE código até alguém recarregar. Como os dados continuam
 * chegando (React Query + realtime), a tela parece viva — mas o código é
 * antigo. Resultado: função nova que "está no ar" simplesmente não existe
 * pra quem está com a aba aberta, e o app instalado fica aberto por dias.
 *
 * Como detecta: o index.html sempre aponta pro bundle atual. Buscamos ele
 * (sem cache) e comparamos o hash com o do <script> que ESTA aba carregou.
 * Diferente = tem versão nova. Não precisa de service worker nem de nada no
 * build — funciona com o hash que o próprio Vite já gera.
 */

/** Hash do bundle que esta aba está rodando (null em dev, que não tem hash). */
function bundleAtual(): string | null {
  const tags = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
  const src = tags.map((t) => t.src).find((s) => /assets\/index-[A-Za-z0-9_-]+\.js/.test(s));
  return src?.match(/assets\/index-([A-Za-z0-9_-]+)\.js/)?.[1] ?? null;
}

async function bundleNoAr(): Promise<string | null> {
  // cache: no-store senão o próprio navegador devolve o index.html velho e a
  // checagem nunca acusaria nada.
  const r = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) return null;
  const html = await r.text();
  return html.match(/assets\/index-([A-Za-z0-9_-]+)\.js/)?.[1] ?? null;
}

export function AvisoNovaVersao() {
  const [temNova, setTemNova] = useState(false);

  useEffect(() => {
    const atual = bundleAtual();
    if (!atual) return;   // dev: sem hash, nada a comparar

    let vivo = true;
    const checar = async () => {
      if (!vivo || document.hidden) return;
      try {
        const noAr = await bundleNoAr();
        if (vivo && noAr && noAr !== atual) setTemNova(true);
      } catch {
        /* offline ou deploy em andamento — tenta de novo depois */
      }
    };

    checar();
    // De 5 em 5 minutos e sempre que a pessoa volta pra aba — que é quando
    // ela vai usar o sistema e quando o aviso importa.
    const id = setInterval(checar, 5 * 60_000);
    const aoFocar = () => checar();
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoFocar);

    return () => {
      vivo = false;
      clearInterval(id);
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoFocar);
    };
  }, []);

  if (!temNova) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-[1.02]"
      >
        <RefreshCw className="h-4 w-4" />
        Nova versão do sistema — clique pra atualizar
      </button>
    </div>
  );
}
