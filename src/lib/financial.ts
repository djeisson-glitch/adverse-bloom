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

export const EXCLUDED_FROM_MARGIN = ["Empréstimos de Bancos", "Compra de equipamentos", "Juros pagos", "Empréstimos de Outras Instituições"];

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
  "Treinamentos",
  "Cursos de edição / direção",
  "Materiais de Escritório",
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
export function calcReceitaTotal(recItems: CAItem[], period: PeriodRange): number {
  return recItems
    .filter((r) => getCat(r) !== "Empréstimos de Bancos" && isInRange(r?.data_competencia, period))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
}

// 2. Receita Recebida (caixa) - data_vencimento in period, field pago
// Excludes loans ("Empréstimos de Bancos")
export function calcReceitaRecebida(recItems: CAItem[], period: PeriodRange): number {
  return recItems
    .filter((r) => getCat(r) !== "Empréstimos de Bancos" && isInRange(r?.data_vencimento, period))
    .reduce((s, r) => s + (r?.pago ?? 0), 0);
}

// 2b. A Receber (em aberto) — saldo de tudo que ainda falta receber, AGORA (não é fluxo do mês).
// Soma `nao_pago` de todas as contas a receber com saldo em aberto, EXCETO:
//  - status LOST (perdidas/incobráveis) e CANCELED (canceladas)
//  - empréstimos ("Empréstimos de Bancos")
// Inclui propositalmente as VENCIDAS (OVERDUE) — continuam sendo dinheiro a receber.
// ACQUITTED (quitadas) têm nao_pago = 0, então saem naturalmente.
export const STATUS_NAO_RECEBIVEL = ["LOST", "CANCELED", "CANCELLED"];
export function calcAReceber(recItems: CAItem[]): number {
  return recItems
    .filter(
      (r) =>
        (r?.nao_pago ?? 0) > 0 &&
        !STATUS_NAO_RECEBIVEL.includes(r?.status ?? "") &&
        getCat(r) !== "Empréstimos de Bancos",
    )
    .reduce((s, r) => s + (r?.nao_pago ?? 0), 0);
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
export function calcAPagarNoMes(payItems: CAItem[], period: PeriodRange): number {
  return payItems
    .filter(
      (p) =>
        (p?.nao_pago ?? 0) > 0 &&
        !STATUS_NAO_PAGAVEL.includes(p?.status ?? "") &&
        isInRange(p?.data_vencimento, period),
    )
    .reduce((s, p) => s + (p?.nao_pago ?? 0), 0);
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
export function calcCustosFixos(payItems: CAItem[], period: PeriodRange): number {
  return payItems
    .filter((r) => FIXED_COSTS.includes(getCat(r)) && !isExcluded(r) && isInRange(r?.data_competencia, period))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
}

// 5. Custos Variáveis - VARIABLE_COSTS includes cat, data_vencimento in period, field total
export function calcCustosVariaveis(payItems: CAItem[], period: PeriodRange): number {
  return payItems
    .filter((r) => VARIABLE_COSTS.includes(getCat(r)) && isInRange(r?.data_competencia, period))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
}

// 5b. Impostos diretos sobre a venda (para a margem bruta)
export function calcImpostosSobreVenda(payItems: CAItem[], period: PeriodRange): number {
  return payItems
    .filter((r) => IMPOSTOS_SOBRE_VENDA.includes(getCat(r)) && isInRange(r?.data_competencia, period))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
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
  return recItems.filter((r) => getCat(r) !== "Empréstimos de Bancos" && r?.data_competencia?.startsWith(key)).reduce((s, r) => s + (r?.total ?? 0), 0);
}

// Monthly despesas operacionais for a given month key
export function monthlyDespesasOp(payItems: CAItem[], key: string): number {
  return payItems
    .filter((r) => !isExcluded(r) && r?.data_competencia?.startsWith(key))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
}
