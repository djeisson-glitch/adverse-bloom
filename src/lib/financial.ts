import type { PeriodRange } from "@/components/PeriodFilter";

export interface CAItem {
  total?: number;
  pago?: number;
  nao_pago?: number;
  status?: string;
  status_traduzido?: string;
  data_vencimento?: string;
  data_competencia?: string;
  categorias?: { nome?: string }[];
  cliente?: { nome?: string };
  descricao?: string;
  fornecedor?: { nome?: string };
  id?: string;
}

export const SALDO_INICIAL = 16307.73;
export const SALDO_INICIAL_DATA = "2025-01-07";

/**
 * O que NÃO é receita, mesmo entrando na conta.
 *
 * Auditado em 23/08/2026 contra o export bruto do Conta Azul: em agosto, dos
 * R$ 37.435,11 que a tela chamava de faturamento, R$ 6.280,64 eram ESTORNO —
 * 16,8% inflando o número. Estorno é dinheiro voltando de uma despesa, não
 * venda; captação de empréstimo é dívida; e "outras entradas não operacionais"
 * inclui coisas como venda de lente usada e PIX do próprio sócio.
 *
 * Contar qualquer uma delas como receita não erra só o faturamento — erra a
 * margem, o ticket médio e o ponto de equilíbrio, que dividem por ela.
 */
export const NAO_E_RECEITA = [
  "Empréstimos de Bancos",
  "Empréstimos de Outras Instituições",
  "Estorno",
  "Outras entradas não operacionais",
];

/**
 * O que sai do banco mas NÃO é despesa do período.
 *
 * - Empréstimo e compra de equipamento: amortização quita dívida e compra de
 *   equipamento vira ativo. Nenhum dos dois consome valor no mês.
 * - Distribuição de lucros: é destinação do resultado, não custo de operar.
 *   Estava dentro, e sozinha respondia por R$ 16.758 de "despesa" em agosto.
 *
 * "Juros pagos" SAIU desta lista: o juro é a única parte do empréstimo que É
 * despesa — é o preço de usar dinheiro dos outros.
 */
export const EXCLUDED_FROM_MARGIN = [
  "Empréstimos de Bancos",
  "Empréstimos de Outras Instituições",
  "Compra de equipamentos",
  "Distribuição de Lucros",
];

export const FIXED_COSTS = [
  "Distribuição de Lucros",
  "Pró-labore",
  "INSS sobre Pró-labore - GPS",
  "IRRF sobre Pró-labore - Darf",
  "Editores - fixo",
  "Gestão de projetos & Produtor - Fixo",
  "Colaboradores - fixo",
  "Aluguel",
  "Softwares operacionais",
  "Software comercial",
  "Honorários Contábeis",
  "Financeiro / BPO",
  "Telefonia e Internet",
  "Tarifas Bancárias",
  "Tarifas",
  "Tarifas DOC / TED",
  "Tarifa de boleto",
  "Tarifas de Cartões de Crédito",
  "Reformas e manutenções do escritório",
  "Manutenção escritório",
  "Manutenção de equipamentos",
  // Reclassificados de variável → fixo (auditoria 2026-06-10): capacitação/estrutura, não variam com projetos.
  "Treinamentos",
  "Cursos de edição / direção",
  "Materiais de Escritório",
];

export const VARIABLE_COSTS = [
  "Editor / Assistente - Variável",
  "Verba de produção",
  "Atores",
  "Locutor",
  "Freela - Operador de câmeras",
  "Comissões de agência",
  "Outras comissões",
  "Aluguel de carro",
  "Aluguel de equipamento",
  "Drone",
  "Combustíveis / Estacionamento",
  "Alimentação",
  "Hospedagens",
  "Passagem aérea",
  "Transporte Urbano (táxi, Uber)",
  "Marketing e Publicidade",
  "Copa e Cozinha",
  "Uniformes",
  "Brindes para Clientes",
  "Confraternizações",
  "Despesas com Viagens dos sócios",
  "Locação",
  "Correios",
  "Exames",
  "Despesas a identificar",
  "Outras taxas administrativas",
  "Honorários (outros)",
  "Multas de Trânsito",
  "Ancine",
  "Aquisição de bens de pequeno valor - cenografia",
  "Freela - Edição",
  "Pedágios",
  "4.11 Outras Despesas",
  "Multas pagas",
];

// Impostos DIRETOS sobre a venda (entram na MARGEM BRUTA). INSS/IRRF são encargos
// independentes da venda e NÃO entram aqui (decisão do dono).
export const IMPOSTOS_SOBRE_VENDA = ["Simples Nacional - DAS", "ISS", "ISS Retido"];

// Custos DIRETOS do projeto/job (entram na MARGEM BRUTA).
export const CUSTOS_DO_PROJETO = [
  "Editor / Assistente - Variável", "Freela - Edição", "Verba de produção",
  "Atores", "Locutor", "Freela - Operador de câmeras", "Aluguel de equipamento",
  "Aluguel de carro", "Drone", "Locação", "Combustíveis / Estacionamento",
  "Alimentação", "Hospedagens", "Passagem aérea", "Transporte Urbano (táxi, Uber)", "Pedágios",
];

// Pró-labore + Distribuição de Lucros são exibidos unificados como "Salário".
export const SALARIO_CATEGORIES = ["Pró-labore", "Distribuição de Lucros"];
// Retirada total dos sócios (pró-labore + distribuição de lucros) no período, por competência.
// É a remuneração fixa dos sócios — dividida em 2 rubricas só por questão fiscal.
export function calcRetiradaSocios(payItems: CAItem[], period: PeriodRange): number {
  return payItems
    .filter((p) => SALARIO_CATEGORIES.includes(getCat(p)) && isInRange(p?.data_competencia, period))
    .reduce((s, p) => s + (p?.total ?? 0), 0);
}
export function displayCat(cat: string): string {
  return SALARIO_CATEGORIES.includes(cat) ? "Salário" : cat;
}

export function getCat(item: CAItem): string {
  return item.categorias?.[0]?.nome || "Sem categoria";
}

export function isExcluded(item: CAItem): boolean {
  return EXCLUDED_FROM_MARGIN.includes(getCat(item));
}

export function isInRange(dateStr: string | undefined, range: PeriodRange): boolean {
  if (!dateStr) return false;
  return dateStr >= range.from && dateStr <= range.to;
}

// 1. Receita Total (competência) - data_competencia in period, all statuses, field total
// Excludes loans ("Empréstimos de Bancos")
export function receitaTotalItems(recItems: CAItem[], period: PeriodRange): CAItem[] {
  return recItems.filter((r) => !NAO_E_RECEITA.includes(getCat(r)) && isInRange(r?.data_competencia, period));
}
export function calcReceitaTotal(recItems: CAItem[], period: PeriodRange): number {
  return receitaTotalItems(recItems, period).reduce((s, r) => s + (r?.total ?? 0), 0);
}

// 2. Receita Recebida (caixa) - data_vencimento in period, field pago
// Excludes loans ("Empréstimos de Bancos")
export function recebidoItems(recItems: CAItem[], period: PeriodRange): CAItem[] {
  return recItems.filter((r) => !NAO_E_RECEITA.includes(getCat(r)) && isInRange(r?.data_vencimento, period) && (r?.pago ?? 0) > 0);
}
export function calcReceitaRecebida(recItems: CAItem[], period: PeriodRange): number {
  return recItems
    .filter((r) => !NAO_E_RECEITA.includes(getCat(r)) && isInRange(r?.data_vencimento, period))
    .reduce((s, r) => s + (r?.pago ?? 0), 0);
}

// Pago realizado no período (caixa) — soma do `pago` das contas a pagar com vencimento no período.
// Contrapartida de saída da geração de caixa do mês.
export function calcPagoRealizado(payItems: CAItem[], period: PeriodRange): number {
  return payItems
    .filter((p) => isInRange(p?.data_vencimento, period))
    .reduce((s, p) => s + (p?.pago ?? 0), 0);
}

// Chaves YYYY-MM dos N meses COMPLETOS antes do mês selecionado (evita o mês parcial corrente).
export function trailingMonthKeys(period: PeriodRange, n: number): string[] {
  const [y, m] = period.from.split("-").map(Number);
  const keys: string[] = [];
  for (let i = n; i >= 1; i--) {
    let yy = y;
    let mm = m - i;
    while (mm <= 0) { mm += 12; yy -= 1; }
    keys.push(`${yy}-${String(mm).padStart(2, "0")}`);
  }
  return keys;
}

// Tendência dos N meses fechados antes do mês selecionado — margens líquida e de caixa
// no MESMO critério, sem o ruído do mês parcial.
export interface TrailingResumo {
  meses: string[];
  margemLiquidaPct: number; // (receita − despesas op.) / receita, por competência
  margemCaixaPct: number;   // (recebido − pago) / recebido, por vencimento
  geracaoCaixaMedia: number; // (recebido − pago) / nº meses
  resultado: number;
  receita: number;
}
export function calcTrailing(recItems: CAItem[], payItems: CAItem[], period: PeriodRange, n = 3): TrailingResumo {
  const keys = trailingMonthKeys(period, n);
  const inComp = (d?: string) => !!d && keys.some((k) => d.startsWith(k));
  const receita = recItems.filter((r) => !NAO_E_RECEITA.includes(getCat(r)) && inComp(r?.data_competencia)).reduce((s, r) => s + (r?.total ?? 0), 0);
  const despesasOp = payItems.filter((r) => !isExcluded(r) && inComp(r?.data_competencia)).reduce((s, r) => s + (r?.total ?? 0), 0);
  // Caixa OPERACIONAL (exclui empréstimos, juros e compra de equipamentos), pra ser comparável à margem líquida.
  const recebido = recItems.filter((r) => !NAO_E_RECEITA.includes(getCat(r)) && inComp(r?.data_vencimento)).reduce((s, r) => s + (r?.pago ?? 0), 0);
  const pago = payItems.filter((r) => !isExcluded(r) && inComp(r?.data_vencimento)).reduce((s, r) => s + (r?.pago ?? 0), 0);
  return {
    meses: keys,
    margemLiquidaPct: receita > 0 ? ((receita - despesasOp) / receita) * 100 : 0,
    margemCaixaPct: recebido > 0 ? ((recebido - pago) / recebido) * 100 : 0,
    geracaoCaixaMedia: (recebido - pago) / n,
    resultado: receita - despesasOp,
    receita,
  };
}

// 2b. A Receber (em aberto) — saldo de tudo que ainda falta receber, AGORA (não é fluxo do mês).
// Soma `nao_pago` de todas as contas a receber com saldo em aberto, EXCETO:
//  - status LOST (perdidas/incobráveis) e CANCELED (canceladas)
//  - empréstimos ("Empréstimos de Bancos")
// Inclui propositalmente as VENCIDAS (OVERDUE) — continuam sendo dinheiro a receber.
// ACQUITTED (quitadas) têm nao_pago = 0, então saem naturalmente.
export const STATUS_NAO_RECEBIVEL = ["LOST", "CANCELED", "CANCELLED"];
export function aReceberItems(recItems: CAItem[]): CAItem[] {
  return recItems.filter(
    (r) =>
      (r?.nao_pago ?? 0) > 0 &&
      !STATUS_NAO_RECEBIVEL.includes(r?.status ?? "") &&
      !NAO_E_RECEITA.includes(getCat(r)),
  );
}
export function calcAReceber(recItems: CAItem[]): number {
  return aReceberItems(recItems).reduce((s, r) => s + (r?.nao_pago ?? 0), 0);
}
// A Receber NO PERÍODO — em aberto, por vencimento no período (segue o seletor de mês).
export function aReceberNoMesItems(recItems: CAItem[], period: PeriodRange): CAItem[] {
  return aReceberItems(recItems).filter((r) => isInRange(r?.data_vencimento, period));
}
export function calcAReceberNoMes(recItems: CAItem[], period: PeriodRange): number {
  return aReceberNoMesItems(recItems, period).reduce((s, r) => s + (r?.nao_pago ?? 0), 0);
}
export function calcAReceberVencidoNoMes(recItems: CAItem[], period: PeriodRange, hoje: string): number {
  return aReceberNoMesItems(recItems, period)
    .filter((r) => !!r?.data_vencimento && r.data_vencimento < hoje)
    .reduce((s, r) => s + (r?.nao_pago ?? 0), 0);
}
// Entradas PREVISTAS no mês (caixa projetado) — valor cheio de tudo que vence no período
// e ainda pode entrar (exclui só perdidas/canceladas). Inclui o já recebido e empréstimos:
// visão de caixa TOTAL, simétrica a calcPagamentosDoMes (que inclui amortizações/juros/capex)
// e coerente com o movimento do saldo em conta.
export function entradasPrevistasNoMesItems(recItems: CAItem[], period: PeriodRange): CAItem[] {
  return recItems.filter(
    (r) => isInRange(r?.data_vencimento, period) && !STATUS_NAO_RECEBIVEL.includes(r?.status ?? ""),
  );
}
export function calcEntradasPrevistasNoMes(recItems: CAItem[], period: PeriodRange): number {
  return entradasPrevistasNoMesItems(recItems, period).reduce((s, r) => s + (r?.total ?? 0), 0);
}

// Recebido TOTAL no período (caixa) — soma do `pago` de TODAS as contas a receber com
// vencimento no período, incl. empréstimos. Contrapartida de entrada da geração de caixa,
// simétrica a calcPagoRealizado (que também não exclui nada).
export function calcRecebidoTotal(recItems: CAItem[], period: PeriodRange): number {
  return recItems
    .filter((r) => isInRange(r?.data_vencimento, period))
    .reduce((s, r) => s + (r?.pago ?? 0), 0);
}

// 2c. A Pagar (em aberto) — total de tudo que ainda falta pagar, AGORA (saldo, não fluxo do mês).
// Soma `nao_pago` de todas as contas a pagar com saldo em aberto, exceto CANCELADAS.
// Inclui financiamentos/empréstimos/juros (é o total real devido) e as VENCIDAS.
// ACQUITTED (quitadas) têm nao_pago = 0 e saem naturalmente.
export const STATUS_NAO_PAGAVEL = ["CANCELED", "CANCELLED"];
export function calcAPagar(payItems: CAItem[]): number {
  return payItems
    .filter((p) => (p?.nao_pago ?? 0) > 0 && !STATUS_NAO_PAGAVEL.includes(p?.status ?? ""))
    .reduce((s, p) => s + (p?.nao_pago ?? 0), 0);
}
// Parcela vencida (atrasada) do "a pagar" — para destaque no card.
export function calcAPagarVencido(payItems: CAItem[], hoje: string): number {
  return payItems
    .filter(
      (p) =>
        (p?.nao_pago ?? 0) > 0 &&
        !STATUS_NAO_PAGAVEL.includes(p?.status ?? "") &&
        !!p?.data_vencimento &&
        p.data_vencimento < hoje,
    )
    .reduce((s, p) => s + (p?.nao_pago ?? 0), 0);
}

// 2d. A Pagar NO PERÍODO — em aberto, por vencimento no período selecionado (segue o seletor de mês).
export function aPagarNoMesItems(payItems: CAItem[], period: PeriodRange): CAItem[] {
  return payItems.filter(
    (p) =>
      (p?.nao_pago ?? 0) > 0 &&
      !STATUS_NAO_PAGAVEL.includes(p?.status ?? "") &&
      isInRange(p?.data_vencimento, period),
  );
}
export function calcAPagarNoMes(payItems: CAItem[], period: PeriodRange): number {
  return aPagarNoMesItems(payItems, period).reduce((s, p) => s + (p?.nao_pago ?? 0), 0);
}

// TOTAL a pagar do mês — TODOS os lançamentos com vencimento no período (pagos + a vencer + vencidos),
// pelo valor cheio (total), exceto cancelados (anulados). É o volume total do mês, independente do status.
export function pagamentosDoMesItems(payItems: CAItem[], period: PeriodRange): CAItem[] {
  return payItems.filter(
    (p) => !STATUS_NAO_PAGAVEL.includes(p?.status ?? "") && isInRange(p?.data_vencimento, period),
  );
}
export function calcPagamentosDoMes(payItems: CAItem[], period: PeriodRange): number {
  return pagamentosDoMesItems(payItems, period).reduce((s, p) => s + (p?.total ?? 0), 0);
}
// Parcela já vencida (venc < hoje) dentro do período — para destaque no card.
export function calcAPagarVencidoNoMes(payItems: CAItem[], period: PeriodRange, hoje: string): number {
  return payItems
    .filter(
      (p) =>
        (p?.nao_pago ?? 0) > 0 &&
        !STATUS_NAO_PAGAVEL.includes(p?.status ?? "") &&
        isInRange(p?.data_vencimento, period) &&
        !!p?.data_vencimento &&
        p.data_vencimento < hoje,
    )
    .reduce((s, p) => s + (p?.nao_pago ?? 0), 0);
}

// 3. Despesas Operacionais - !isExcluded, data_vencimento in period, field total
export function calcDespesasOperacionais(payItems: CAItem[], period: PeriodRange): number {
  return payItems
    .filter((r) => !isExcluded(r) && isInRange(r?.data_competencia, period))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
}

// 4. Custos Fixos - FIXED_COSTS includes cat && !isExcluded, data_vencimento in period, field total
export function custosFixosItems(payItems: CAItem[], period: PeriodRange): CAItem[] {
  return payItems.filter((r) => FIXED_COSTS.includes(getCat(r)) && !isExcluded(r) && isInRange(r?.data_competencia, period));
}
export function calcCustosFixos(payItems: CAItem[], period: PeriodRange): number {
  return custosFixosItems(payItems, period).reduce((s, r) => s + (r?.total ?? 0), 0);
}

// 5. Custos Variáveis - VARIABLE_COSTS includes cat, data_vencimento in period, field total
export function custosVariaveisItems(payItems: CAItem[], period: PeriodRange): CAItem[] {
  return payItems.filter((r) => VARIABLE_COSTS.includes(getCat(r)) && isInRange(r?.data_competencia, period));
}
export function calcCustosVariaveis(payItems: CAItem[], period: PeriodRange): number {
  return custosVariaveisItems(payItems, period).reduce((s, r) => s + (r?.total ?? 0), 0);
}

// 5b. Impostos diretos sobre a venda (para a margem bruta)
export function impostosSobreVendaItems(payItems: CAItem[], period: PeriodRange): CAItem[] {
  return payItems.filter((r) => IMPOSTOS_SOBRE_VENDA.includes(getCat(r)) && isInRange(r?.data_competencia, period));
}
export function calcImpostosSobreVenda(payItems: CAItem[], period: PeriodRange): number {
  return impostosSobreVendaItems(payItems, period).reduce((s, r) => s + (r?.total ?? 0), 0);
}

// 5c. Custos diretos do projeto (para a margem bruta)
export function calcCustosDoProjeto(payItems: CAItem[], period: PeriodRange): number {
  return payItems
    .filter((r) => CUSTOS_DO_PROJETO.includes(getCat(r)) && isInRange(r?.data_competencia, period))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
}

// 5d. Margem Bruta = Receita − Impostos sobre venda − Custos do projeto (definição do dono)
export function calcMargemBruta(receitaTotal: number, impostosVenda: number, custosProjeto: number) {
  const valor = receitaTotal - impostosVenda - custosProjeto;
  const pct = receitaTotal > 0 ? (valor / receitaTotal) * 100 : 0;
  return { valor, pct };
}

// 6. Margem de Contribuição
export function calcMargemContribuicao(receitaTotal: number, custosVariaveis: number) {
  const valor = receitaTotal - custosVariaveis;
  const pct = receitaTotal > 0 ? (valor / receitaTotal) * 100 : 0;
  return { valor, pct };
}

// 7. Lucro Líquido & Margem Líquida
export function calcLucroLiquido(receitaTotal: number, despesasOperacionais: number) {
  const valor = receitaTotal - despesasOperacionais;
  const pct = receitaTotal > 0 ? (valor / receitaTotal) * 100 : 0;
  return { valor, pct };
}

// 7b. Lucro Líquido Final (inclui empréstimos e investimentos)
export function calcLucroLiquidoFinal(receitaTotal: number, payItems: CAItem[], period: PeriodRange) {
  // Soma TODAS as despesas por COMPETÊNCIA, incluindo as que estão em EXCLUDED_FROM_MARGIN
  const todasDespesas = payItems
    .filter((r) => isInRange(r?.data_competencia, period))
    .reduce((s, r) => s + (r?.total ?? 0), 0);

  const valor = receitaTotal - todasDespesas;
  const pct = receitaTotal > 0 ? (valor / receitaTotal) * 100 : 0;
  return { valor, pct };
}

// 7c. Não operacional (empréstimos, juros, compra de equipamentos) — por competência.
export function calcNaoOperacional(payItems: CAItem[], period: PeriodRange): number {
  return payItems
    .filter((r) => isExcluded(r) && isInRange(r?.data_competencia, period))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
}

// DRE Gerencial — cascata por competência. Fecha exatamente com a margem líquida:
// Receita Bruta − Impostos = Receita Líquida; − Custos do Projeto = Margem Bruta;
// − Custos Fixos − Outras Variáveis = Resultado Operacional (margem líquida);
// − Não Operacional = Resultado Líquido Final.
export interface DRERow {
  label: string;
  valor: number;
  /** "receita"=entrada | "deducao"=saída | "subtotal" | "resultado" */
  tipo: "receita" | "deducao" | "subtotal" | "resultado";
  /** % sobre a receita bruta */
  pct: number;
}
export function calcDRE(recItems: CAItem[], payItems: CAItem[], period: PeriodRange): DRERow[] {
  const receitaBruta = calcReceitaTotal(recItems, period);
  const impostos = calcImpostosSobreVenda(payItems, period);
  const receitaLiquida = receitaBruta - impostos;
  const custosProjeto = calcCustosDoProjeto(payItems, period);
  const margemBruta = receitaLiquida - custosProjeto;
  const custosFixos = calcCustosFixos(payItems, period);
  const custosVariaveis = calcCustosVariaveis(payItems, period);
  const outrasVariaveis = custosVariaveis - custosProjeto; // variáveis que não são custo direto do projeto
  const resultadoOperacional = receitaBruta - calcDespesasOperacionais(payItems, period);
  const naoOperacional = calcNaoOperacional(payItems, period);
  const resultadoFinal = resultadoOperacional - naoOperacional;
  const pct = (v: number) => (receitaBruta > 0 ? (v / receitaBruta) * 100 : 0);
  return [
    { label: "Receita Bruta", valor: receitaBruta, tipo: "receita", pct: 100 },
    { label: "(−) Impostos sobre venda", valor: -impostos, tipo: "deducao", pct: pct(-impostos) },
    { label: "(=) Receita Líquida", valor: receitaLiquida, tipo: "subtotal", pct: pct(receitaLiquida) },
    { label: "(−) Custos diretos do projeto", valor: -custosProjeto, tipo: "deducao", pct: pct(-custosProjeto) },
    { label: "(=) Margem Bruta", valor: margemBruta, tipo: "subtotal", pct: pct(margemBruta) },
    { label: "(−) Custos Fixos", valor: -custosFixos, tipo: "deducao", pct: pct(-custosFixos) },
    { label: "(−) Outras despesas variáveis", valor: -outrasVariaveis, tipo: "deducao", pct: pct(-outrasVariaveis) },
    { label: "(=) Resultado Operacional (Margem Líquida)", valor: resultadoOperacional, tipo: "subtotal", pct: pct(resultadoOperacional) },
    { label: "(−) Não operacional (empréstimos, juros, equip.)", valor: -naoOperacional, tipo: "deducao", pct: pct(-naoOperacional) },
    { label: "(=) Resultado Líquido Final", valor: resultadoFinal, tipo: "resultado", pct: pct(resultadoFinal) },
  ];
}

// 8. Ponto de Equilíbrio
export function calcPontoEquilibrio(custosFixos: number, margemContribuicaoPct: number): number {
  return margemContribuicaoPct > 0 ? custosFixos / (margemContribuicaoPct / 100) : 0;
}

// 9. Ticket Médio - receitaTotal / count of receivables in period (by data_competencia)
export function calcTicketMedio(
  recItems: CAItem[],
  period: PeriodRange,
  receitaTotal: number,
): { valor: number; qtde: number } {
  const qtde = recItems.filter((r) => isInRange(r?.data_competencia, period)).length;
  return { valor: qtde > 0 ? receitaTotal / qtde : 0, qtde };
}

// 10. Burn Rate - avg monthly sum of payables pago for last 3 COMPLETE months (exclude current)
export function calcBurnRate(payItems: CAItem[]): number {
  const now = new Date();
  let total = 0;
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    total += payItems.filter((r) => r?.data_vencimento?.startsWith(key)).reduce((s, r) => s + (r?.pago ?? 0), 0);
  }
  return total / 3;
}

// 12. Saldo em Conta
export function calcSaldoEmConta(
  recItems: CAItem[],
  payItems: CAItem[],
  saldoInicial?: number | null,
  saldoInicialData?: string | null,
): number {
  const base = saldoInicial ?? SALDO_INICIAL;
  const dataBase = saldoInicialData || SALDO_INICIAL_DATA;
  const recebido = recItems
    .filter((r) => r?.data_vencimento && r.data_vencimento >= dataBase)
    .reduce((s, r) => s + (r?.pago ?? 0), 0);
  const pago = payItems
    .filter((r) => r?.data_vencimento && r.data_vencimento >= dataBase)
    .reduce((s, r) => s + (r?.pago ?? 0), 0);
  return base + recebido - pago;
}

// Custos Fixos grouped by category
export function calcCustosFixosPorCategoria(payItems: CAItem[], period: PeriodRange): [string, number][] {
  const byCategory: Record<string, number> = {};
  payItems
    .filter((r) => FIXED_COSTS.includes(getCat(r)) && !isExcluded(r) && isInRange(r?.data_competencia, period))
    .forEach((item) => {
      const cat = getCat(item);
      byCategory[cat] = (byCategory[cat] || 0) + (item?.total ?? 0);
    });
  return Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
}

// Custos Variáveis grouped by category
export function calcCustosVariaveisPorCategoria(payItems: CAItem[], period: PeriodRange): [string, number][] {
  const byCategory: Record<string, number> = {};
  payItems
    .filter((r) => VARIABLE_COSTS.includes(getCat(r)) && isInRange(r?.data_competencia, period))
    .forEach((item) => {
      const cat = getCat(item);
      byCategory[cat] = (byCategory[cat] || 0) + (item?.total ?? 0);
    });
  return Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
}

// Monthly key helper
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// Monthly receita total (competência) for a given month key
// Excludes loans
export function monthlyReceitaTotal(recItems: CAItem[], key: string): number {
  return recItems.filter((r) => !NAO_E_RECEITA.includes(getCat(r)) && r?.data_competencia?.startsWith(key)).reduce((s, r) => s + (r?.total ?? 0), 0);
}

// Monthly despesas operacionais for a given month key
export function monthlyDespesasOp(payItems: CAItem[], key: string): number {
  return payItems
    .filter((r) => !isExcluded(r) && r?.data_competencia?.startsWith(key))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
}
