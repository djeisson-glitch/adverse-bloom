import type { ReactNode } from "react";

/**
 * URL solta em texto vira link clicável.
 *
 * O time cola link de Frame.io, Drive e WeTransfer o dia inteiro no canal da
 * peça, no briefing e na descrição da alteração — e do outro lado alguém
 * precisava selecionar, copiar e colar na barra do navegador. Trabalho manual
 * repetido é o tipo de coisa que o sistema deve absorver.
 *
 * Feito por SPLIT e nós React, nunca por innerHTML: texto do usuário virando
 * HTML é a porta de entrada clássica de XSS, e aqui esse texto passa por
 * canal de cliente e formulário público.
 *
 * `rel="noreferrer"` junto do target=_blank fecha o `window.opener`, senão a
 * página aberta consegue mexer na aba de origem.
 */

// http(s) explícito, ou domínio começando com www. A pontuação final não
// entra: "veja em exemplo.com/a." não deve levar o ponto pro href.
const RE_URL = /((?:https?:\/\/|www\.)[^\s<>"')\]]+[^\s<>"')\].,;:!?])/gi;

/**
 * Só http/https viram link — javascript: e data: ficam como texto puro.
 *
 * Exportado porque o portfólio do banco de talentos precisa da MESMA regra:
 * ali o link também vem de formulário público, e uma segunda implementação
 * do "que protocolo é seguro" é uma segunda chance de errar.
 */
export function hrefSeguro(bruto: string): string | null {
  const url = bruto.startsWith("www.") ? `https://${bruto}` : bruto;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Encurta pra caber na tela sem perder de que site é. */
function rotulo(bruto: string): string {
  const semProto = bruto.replace(/^https?:\/\//, "");
  return semProto.length > 48 ? `${semProto.slice(0, 45)}…` : semProto;
}

/**
 * Quebra um texto em pedaços, transformando as URLs em <a>. Devolve nós React
 * pra ser usado dentro de qualquer parágrafo.
 */
export function comLinks(texto: string, chave: string | number = "l"): ReactNode[] {
  if (!texto) return [];
  return texto.split(RE_URL).map((parte, i) => {
    if (i % 2 === 1) {
      const href = hrefSeguro(parte);
      if (href) {
        return (
          <a
            key={`${chave}-${i}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}   // link dentro de card clicável
            className="break-all text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
            title={parte}
          >
            {rotulo(parte)}
          </a>
        );
      }
    }
    return parte ? <span key={`${chave}-${i}`}>{parte}</span> : null;
  });
}

/** Açúcar pra quando o texto é o conteúdo inteiro do elemento. */
export function TextoComLinks({ texto }: { texto?: string | null }) {
  return <>{comLinks(texto || "")}</>;
}
