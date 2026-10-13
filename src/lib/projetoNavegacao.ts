/** Só listas de projetos e fichas de clientes podem ser destinos de retorno. */
export function origemProjetos(valor: string | null): string | null {
  if (!valor) return null;
  const caminho = valor.split("?")[0];
  return /^(\/projetos|\/clientes\/[a-zA-Z0-9-]+)$/.test(caminho) ? valor : null;
}

export function linkProjeto(id: string, origem: string, aba?: "diarias") {
  const params = new URLSearchParams();
  const retorno = origemProjetos(origem);
  if (retorno) params.set("retorno", retorno);
  if (aba) params.set("aba", aba);
  return `/projetos/${encodeURIComponent(id)}${params.size ? `?${params}` : ""}`;
}
