import { useEffect, useRef } from "react";

const TITULO_BASE = "Adverse OS";

/**
 * Marca a ABA quando há notificação não lida — "(3) Adverse OS" no título e uma
 * bolinha com o número por cima do favicon.
 *
 * No uso de computador isto vale mais que o balão do sistema: o balão some em
 * segundos e pode estar silenciado pelo Foco do macOS; a aba fica marcada até
 * a pessoa ler, e aparece mesmo no meio de 20 abas abertas.
 */
export function useSinalAba(naoLidas: number) {
  const faviconOriginal = useRef<string | null>(null);

  // Título da aba
  useEffect(() => {
    document.title = naoLidas > 0 ? `(${naoLidas}) ${TITULO_BASE}` : TITULO_BASE;
    return () => { document.title = TITULO_BASE; };
  }, [naoLidas]);

  // Bolinha no favicon
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    if (faviconOriginal.current === null) faviconOriginal.current = link.getAttribute("href") || "/favicon.ico";

    if (naoLidas <= 0) {
      link.href = faviconOriginal.current;
      return;
    }

    let cancelado = false;
    const img = new Image();
    img.onload = () => {
      if (cancelado || !link) return;
      try {
        const c = document.createElement("canvas");
        c.width = 64;
        c.height = 64;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 64, 64);
        ctx.beginPath();
        ctx.arc(45, 19, 19, 0, Math.PI * 2);
        ctx.fillStyle = "#f4361a";
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(naoLidas > 9 ? "9+" : String(naoLidas), 45, 20);
        link.href = c.toDataURL("image/png");
      } catch {
        /* favicon é bônus — nunca derruba a tela */
      }
    };
    img.src = "/icon-192.png";
    return () => { cancelado = true; };
  }, [naoLidas]);
}
