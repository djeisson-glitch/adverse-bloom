/**
 * Qual orçamento uma carta representa.
 *
 * A regra parece óbvia e já falhou em TRÊS lugares diferentes (link público,
 * carta completa, carta simples), sempre do mesmo jeito: `deal_id` + "o mais
 * recente". Isso era inofensivo enquanto cada deal tinha um orçamento só;
 * desde que existem variantes, "o mais recente" passou a significar "a última
 * opção que alguém criou" — e a carta saía com os dados de outra opção, em
 * silêncio, direto pro cliente.
 *
 * Como é a MESMA decisão em vários lugares, ela vira função com teste. Erro
 * aqui não aparece na tela de quem monta: aparece na mesa do cliente.
 */

export type OpcaoOrcamento = {
  id: string;
  parent_budget_id?: string | null;
  is_latest_version?: boolean | null;
  created_at?: string | null;
  variante_nome?: string | null;
};

/**
 * `opcaoId` é a opção aberta na tela (vem em `?opcao=`). Sem ela, vale o
 * PRINCIPAL — o que não tem pai — e nunca o mais recente.
 */
export function orcamentoDaCarta<T extends OpcaoOrcamento>(
  todos: T[],
  opcaoId?: string | null,
): T | null {
  if (!todos?.length) return null;

  if (opcaoId) {
    const escolhido = todos.find((b) => b.id === opcaoId);
    // Opção pedida que não existe mais (link velho, opção apagada): cai no
    // principal em vez de devolver outra qualquer.
    if (escolhido) return escolhido;
  }

  const principais = todos
    .filter((b) => !b.parent_budget_id && b.is_latest_version !== false)
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));

  return principais[0] ?? null;
}

/**
 * Qual LETRA identifica esta opção no nome do arquivo exportado.
 *
 * Djêisson (26/08): "ao exportar as propostas, elas venham com nome único, se
 * não fica parecendo que é a mesma". Duas opções do mesmo negócio saíam com o
 * mesmo `[0329] TITULO - Proposta Adverse`, e na mesa do cliente viravam dois
 * arquivos indistinguíveis.
 *
 * A letra vem da ORDEM DE CRIAÇÃO: a principal nasce primeiro e é sempre A.
 * Só aparece quando existe mais de uma opção — num negócio com uma proposta
 * só, `[0329A]` seria ruído sem informação.
 *
 * Limite conhecido: apagar uma opção do meio desloca as letras das seguintes.
 * Por isso o nome do arquivo carrega TAMBÉM o nome da variante, que não se
 * desloca — a letra separa, o nome diz qual é.
 */
export function letraDaOpcao<T extends OpcaoOrcamento>(todos: T[], id?: string | null): string {
  const vivos = (todos || [])
    .filter((b) => b.is_latest_version !== false)
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  if (vivos.length < 2 || !id) return "";
  const i = vivos.findIndex((b) => b.id === id);
  if (i < 0) return "";
  // 26 opções no mesmo negócio não acontece; se acontecer, AA, AB...
  return i < 26
    ? String.fromCharCode(65 + i)
    : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
}
