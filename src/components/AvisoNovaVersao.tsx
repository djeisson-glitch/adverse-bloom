import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
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
  const { pathname } = useLocation();
  // Rota em que a pessoa estava QUANDO a versão nova foi detectada — não a
  // rota de montagem. Se guardasse a de montagem, quem já tivesse navegado
  // antes da detecção levaria um reload no meio do trabalho.
  const rotaAoDetectar = useRef<string | null>(null);

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

  /**
   * Atualiza na PRÓXIMA NAVEGAÇÃO.
   *
   * Só o banner não resolve "todo mundo atualiza": dá pra ignorar por dias, e
   * depois de uma migration o código velho pode chamar coisa que não existe
   * mais. Forçar reload na hora seria pior — a pessoa pode estar no meio de
   * um orçamento.
   *
   * Trocar de tela é o momento perfeito: ela já está saindo da página, não
   * há nada pra perder, e recarregar ali entrega a versão nova sem
   * interromper ninguém. Quem fica parado na mesma tela ainda tem o botão.
   */
  useEffect(() => {
    if (!temNova) return;
    if (rotaAoDetectar.current === null) {
      rotaAoDetectar.current = pathname;   // marca onde estava ao detectar
      return;
    }
    if (pathname !== rotaAoDetectar.current) window.location.reload();
  }, [temNova, pathname]);

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
