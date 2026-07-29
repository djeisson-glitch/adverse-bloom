/**
 * Como o nome de uma pessoa aparece na tela.
 *
 * Só o primeiro nome: as listas do OS são varridas de relance (quem está
 * rodando, quem aprova, de quem é a peça) e "Djêisson Mauss" ocupa o dobro do
 * espaço pra dizer a mesma coisa que "Djêisson".
 *
 * O nome completo continua no banco e nas telas de cadastro — aqui é só a
 * forma de exibir.
 */
export function primeiroNome(nome?: string | null, fallback = "—"): string {
  const t = (nome || "").trim();
  if (!t) return fallback;
  // e-mail sem nome: usa o que vem antes do @
  if (t.includes("@") && !t.includes(" ")) return t.split("@")[0];
  return t.split(/\s+/)[0];
}

/** Iniciais pro avatar quando não há foto. */
export function iniciais(nome?: string | null): string {
  const p = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "—";
  return (p[0][0] + (p[1]?.[0] || "")).toUpperCase();
}
