/**
 * Cor estável por pessoa — estilo WhatsApp: cada participante ganha uma cor
 * própria (sempre a mesma) pra bater o olho e saber quem falou / quem foi
 * mencionado. Determinístico pelo id (ou nome) via hash simples.
 *
 * Paleta escolhida pra ler bem no fundo escuro do sistema (tons ~300, vivos
 * mas não gritantes) e pra as cores vizinhas serem distinguíveis entre si.
 */
const PALETA_USUARIO = [
  "#e5737e", // vermelho suave
  "#f06fb0", // rosa
  "#c17fd4", // roxo
  "#9a86e0", // roxo-azulado
  "#7c8fe4", // índigo
  "#5fa8f5", // azul
  "#3fc0e0", // ciano
  "#37c9a8", // teal
  "#5fbf7a", // verde
  "#9ccc65", // verde-limão
  "#e0c04a", // amarelo-mostarda
  "#f0a850", // laranja
  "#e08a6a", // terracota
  "#c9a27f", // areia
  "#9aa7b5", // azul-acinzentado
  "#e58fb0", // rosa claro
] as const;

export function corDoUsuario(seed: string | null | undefined): string {
  const s = (seed || "").trim();
  if (!s) return "#9aa7b5";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETA_USUARIO[h % PALETA_USUARIO.length];
}

/** Primeiro nome/token — é o "@handle" que se usa pra mencionar a pessoa. */
export function handleUsuario(nomeOuEmail: string | null | undefined): string {
  return (nomeOuEmail || "").trim().split(/\s+/)[0] || "?";
}
