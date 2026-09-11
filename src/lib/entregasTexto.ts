/**
 * As entregas do orçamento (budgets.entregas) escritas como na carta: uma por
 * linha, "01 Filme principal 60s | 16x9".
 *
 * Única fonte do formato pras três cartas (completa, simples e pública). O
 * texto que a pessoa escreveu na carta (proposta.entregas_texto) sempre vence
 * — em muitos orçamentos ele é redigido à mão e a lista está vazia; isto só
 * preenche quando a carta ainda não tem texto nenhum.
 */
export function entregasParaTexto(entregas: unknown): string {
  if (!Array.isArray(entregas)) return "";
  return entregas
    .filter((e: any) => e && String(e.titulo ?? "").trim())
    .map((e: any) => {
      const qtd = String(e.quantidade || 1).padStart(2, "0");
      const duracao = String(e.duracao ?? "").trim();
      const formato = String(e.formato ?? "").trim();
      return `${qtd} ${String(e.titulo).trim()}${duracao ? ` ${duracao}` : ""}${formato ? ` | ${formato}` : ""}`;
    })
    .join("\n");
}

/** O texto salvo na carta ficou pra trás das entregas do orçamento? */
export function entregasDesatualizadas(textoCarta: string | null | undefined, entregas: unknown): boolean {
  const doOrcamento = entregasParaTexto(entregas);
  if (!doOrcamento) return false;
  return (textoCarta ?? "").trim() !== doOrcamento.trim();
}
