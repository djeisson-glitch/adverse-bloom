/**
 * Regras de recorte da carta de fechamento — em um lugar só, testável.
 *
 * Isto saiu de dentro da tela depois de uma auditoria achar TRÊS números
 * diferentes para "alterações do período" na mesma folha:
 *
 *   4 = alterações das peças do mês (qualquer data do pedido)
 *   3 = alterações pedidas no mês (qualquer peça)   ← o contador mostrava esta
 *   2 = pedidas no mês E em peça do mês             ← a tabela listava esta
 *
 * Cada bloco da carta aplicava o seu próprio recorte, e um documento que vai
 * pro cliente não pode discordar de si mesmo. A regra passa a ser uma só, e
 * está escrita aqui:
 *
 *   O MÊS DE UM JOB É O MÊS EM QUE ELE FOI CRIADO. Tudo que pertence ao job —
 *   horas, alterações, entregas — é desse mês, tenha acontecido quando tiver
 *   acontecido. Alteração pedida em agosto num job de julho é de julho, do
 *   mesmo jeito que a hora lançada em agosto é cobrada em julho.
 *
 * Sem isto, um retrabalho pedido no dia 2 de agosto some do fechamento de
 * julho (onde a hora dele é cobrada) e reaparece no de agosto (onde não há
 * hora nenhuma) — e o cliente pergunta, com razão, o que está pagando.
 */

export type PecaRecorte = { id: string; status?: string | null };
export type AlteracaoRecorte = { id: string; deliverable_id: string };

/** Peças cujo job entrou no período — o corte é a criação, sempre. */
export function pecasDoPeriodo<T extends PecaRecorte>(pecas: T[], idsCriadasNoPeriodo: Set<string>): T[] {
  return pecas.filter((p) => idsCriadasNoPeriodo.has(p.id));
}

/**
 * Alterações que entram no período.
 *
 * Segue a PEÇA, não a data do pedido. É a mesma regra das horas — e é o que
 * faz o número do resumo bater com o que está listado nas linhas.
 *
 * RECEBE AS PEÇAS DA CARTA, não um Set de ids, de propósito. Na primeira
 * versão recebia um Set — e a tela passou o índice de tudo que foi criado no
 * mês NO SISTEMA INTEIRO, todos os clientes: o resumo saiu "22 alterações"
 * com 4 listadas. Um Set aceita qualquer conjunto de ids e não tem como
 * saber que veio o errado; a lista de peças da carta é o único conjunto que
 * a tabela realmente imprime, então derivar dela fecha a porta.
 */
export function alteracoesDoPeriodo<T extends AlteracaoRecorte>(
  alteracoes: T[],
  pecasDaCarta: PecaRecorte[],
): T[] {
  const ids = new Set(pecasDaCarta.map((p) => p.id));
  return alteracoes.filter((a) => ids.has(a.deliverable_id));
}

/** Fecharam de verdade — o resto é trabalho em curso, e a carta diz isso. */
export const STATUS_ENTREGUE = ["entregue", "aprovado", "faturado"];

export function contarEntregues<T extends PecaRecorte>(pecas: T[]): number {
  return pecas.filter((p) => STATUS_ENTREGUE.includes(String(p.status || ""))).length;
}

/**
 * Horas que entram no período.
 *
 * Hora presa a uma peça segue a peça. Hora lançada solta no projeto segue a
 * criação do projeto — é o único caso em que não há peça pra perguntar.
 */
export function horasDoPeriodo<T extends { deliverable_id?: string | null; project_id?: string | null; billable?: boolean | null }>(
  horas: T[],
  idsPecasDoPeriodo: Set<string>,
  projetoNoPeriodo: (projectId: string | null | undefined) => boolean,
): T[] {
  return horas.filter((t) => {
    if (!t.billable) return false;
    if (t.deliverable_id) return idsPecasDoPeriodo.has(t.deliverable_id);
    return projetoNoPeriodo(t.project_id);
  });
}

/* ------------------------------------------------------------ preço da peça */

export type ItemFatura = {
  deliverable_id?: string | null;
  preco?: number | string | null;
  tipo?: string | null;
  percent?: number | string | null;
};

export type Cobranca = {
  temPreco: boolean;
  tipoCobrado: string | null;
  percentCobrado: number;
  valorCobrado: number | null;
  valorTabela: number | null;
};

/**
 * O que a carta imprime na linha da peça.
 *
 * Vem da FATURA, não de um cálculo próprio da carta. A fatura é o documento;
 * a carta explica o documento. Se a carta recalculasse o preço, um dia os
 * dois divergiriam e o cliente teria em mãos duas contas nossas que não
 * fecham — e a discussão não seria sobre qual está certa, seria sobre se dá
 * pra confiar em alguma.
 *
 * O valor de TABELA sai da tabela de preços do cliente, casada pelo tipo, e
 * não de dividir o cobrado pelo percentual: a peça de brinde (0%) não teria
 * como voltar ao valor cheio por aritmética, e uma divisão por zero numa
 * folha de cobrança é o tipo de erro que ninguém perdoa.
 */
export function cobrancaDaPeca(
  peca: { id: string; tipo_cobranca?: string | null; cobranca_percent?: number | null },
  itens: Map<string, ItemFatura>,
  precos: Map<string, number>,
): Cobranca {
  const it = itens.get(peca.id);
  // O tipo que a FATURA resolveu vence o que está na peça: foi ele que gerou
  // o preço. A peça pode ter sido reclassificada na revisão do fechamento.
  const tipo = it?.tipo || peca.tipo_cobranca || null;
  const percent = it ? Number(it.percent ?? 100) : Number(peca.cobranca_percent ?? 100);
  return {
    temPreco: !!it,
    tipoCobrado: tipo,
    percentCobrado: percent,
    valorCobrado: it ? Number(it.preco || 0) : null,
    valorTabela: tipo ? precos.get(String(tipo).toLowerCase()) ?? null : null,
  };
}

/**
 * A carta e a fatura falam dos mesmos números?
 *
 * Divergem quando o rascunho do fechamento está velho: uma peça criada
 * depois da última geração sai na carta sem preço, e o total mente por
 * omissão — mostra a soma do que tem preço como se fosse tudo. O aviso é de
 * tela, nunca de impressão: quem precisa ver é quem envia, não o cliente.
 */
export function conferePrecos(
  linhas: { temPreco?: boolean; valorCobrado?: number | null }[],
  itensFatura: ItemFatura[],
): { totalEntregas: number; totalItensFatura: number; semPreco: number; confere: boolean } {
  const totalEntregas = linhas.reduce((s, l) => s + Number(l.valorCobrado || 0), 0);
  const totalItensFatura = itensFatura.reduce((s, i) => s + Number(i.preco || 0), 0);
  const semPreco = linhas.filter((l) => !l.temPreco).length;
  // Um centavo de tolerância: os dois lados somam os MESMOS numéricos, mas em
  // ordens diferentes, e ponto flutuante não promete associatividade.
  return {
    totalEntregas,
    totalItensFatura,
    semPreco,
    confere: semPreco === 0 && Math.abs(totalEntregas - totalItensFatura) < 0.01,
  };
}
