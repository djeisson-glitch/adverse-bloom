import { hrefSeguro } from "./autolink";

/**
 * Portfólio e Instagram de fornecedor/freelancer: do que a pessoa digita ao
 * link que abre.
 *
 * O campo é de formulário público, então chega de tudo — "instagram.com/fulano",
 * "@fulano", "fulano", "www.site.com/trabalhos", "meusite.com.br". O objetivo
 * do Djêisson é olhar o trabalho de alguém em um clique; um campo que guarda
 * "@fulano" e não abre nada não serve.
 *
 * O que NÃO fazemos: adivinhar. Texto sem cara de link nem de usuário (uma
 * frase, um telefone) volta como null e a tela mostra o texto cru — melhor
 * do que um botão que leva a lugar nenhum.
 */

/** Link do portfólio. Aceita sem protocolo; só http/https saem daqui. */
export function linkPortfolio(bruto?: string | null): string | null {
  const v = (bruto || "").trim();
  if (!v) return null;
  // Sem protocolo: só assume https se parecer domínio (tem ponto e nenhum
  // espaço). "meu portfólio está no drive" não vira https://meu%20portfólio…
  const comProto = /^https?:\/\//i.test(v) ? v : /^[^\s]+\.[^\s]{2,}$/.test(v) ? `https://${v}` : v;
  return hrefSeguro(comProto);
}

/** Link do perfil no Instagram. Aceita @usuario, usuario ou a URL inteira. */
export function linkInstagram(bruto?: string | null): string | null {
  const v = (bruto || "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || /^(www\.)?instagram\.com\//i.test(v)) return linkPortfolio(v);
  // Handle: só o que o Instagram aceita como usuário (letras, números, ponto
  // e underline). Assim "@ me chama no direct" não vira um perfil inexistente.
  const usuario = v.replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(usuario) ? `https://instagram.com/${usuario}` : null;
}

/** Como o link aparece escrito na tela — sem protocolo e sem barra final. */
export function rotuloLink(bruto?: string | null): string {
  const v = (bruto || "").trim();
  return v.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}
