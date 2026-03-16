import type { PeriodRange } from "@/components/PeriodFilter";

export interface CAItem {
  total?: number;
  pago?: number;
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

export const EXCLUDED_FROM_MARGIN = ["Empréstimos de Bancos", "Compra de equipamentos"];

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
  "Simples Nacional - DAS",
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
];

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

// 3. Despesas Operacionais - !isExcluded, data_vencimento in period, field total
export function calcDespesasOperacionais(payItems: CAItem[], period: PeriodRange): number {
  return payItems
    .filter((r) => !isExcluded(r) && isInRange(r?.data_vencimento, period))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
}

// 4. Custos Fixos - FIXED_COSTS includes cat && !isExcluded, data_vencimento in period, field total
export function calcCustosFixos(payItems: CAItem[], period: PeriodRange): number {
  return payItems
    .filter((r) => FIXED_COSTS.includes(getCat(r)) && !isExcluded(r) && isInRange(r?.data_vencimento, period))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
}

// 5. Custos Variáveis - VARIABLE_COSTS includes cat, data_vencimento in period, field total
export function calcCustosVariaveis(payItems: CAItem[], period: PeriodRange): number {
  return payItems
    .filter((r) => VARIABLE_COSTS.includes(getCat(r)) && isInRange(r?.data_vencimento, period))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
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
export function calcSaldoEmConta(recItems: CAItem[], payItems: CAItem[]): number {
  const recebido = recItems
    .filter((r) => r?.data_vencimento && r.data_vencimento >= SALDO_INICIAL_DATA)
    .reduce((s, r) => s + (r?.pago ?? 0), 0);
  const pago = payItems
    .filter((r) => r?.data_vencimento && r.data_vencimento >= SALDO_INICIAL_DATA)
    .reduce((s, r) => s + (r?.pago ?? 0), 0);
  return SALDO_INICIAL + recebido - pago;
}

// Custos Fixos grouped by category
export function calcCustosFixosPorCategoria(payItems: CAItem[], period: PeriodRange): [string, number][] {
  const byCategory: Record<string, number> = {};
  payItems
    .filter((r) => FIXED_COSTS.includes(getCat(r)) && !isExcluded(r) && isInRange(r?.data_vencimento, period))
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
    .filter((r) => VARIABLE_COSTS.includes(getCat(r)) && isInRange(r?.data_vencimento, period))
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
export function monthlyReceitaTotal(recItems: CAItem[], key: string): number {
  return recItems.filter((r) => r?.data_competencia?.startsWith(key)).reduce((s, r) => s + (r?.total ?? 0), 0);
}

// Monthly despesas operacionais for a given month key
export function monthlyDespesasOp(payItems: CAItem[], key: string): number {
  return payItems
    .filter((r) => !isExcluded(r) && r?.data_vencimento?.startsWith(key))
    .reduce((s, r) => s + (r?.total ?? 0), 0);
}
