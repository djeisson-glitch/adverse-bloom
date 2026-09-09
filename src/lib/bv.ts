/**
 * Imposto e BV da agência — os dois são fração do valor FINAL da nota, não
 * acréscimo simples sobre uma base menor.
 *
 * BUG REAL, achado por uma análise externa que o Djêisson trouxe (09/09) logo
 * depois do BV entrar no ar: o campo "Imposto" desta tela sempre calculou
 * `(subtotal2 + comissões) × imposto%` — ou seja, sobre uma base MENOR que a
 * nota fiscal de verdade. Receita Federal/Prefeitura não tributa custo+margem:
 * tributa o VALOR BRUTO da nota, que é o total que o cliente paga. Rodando
 * imposto sobre uma base pequena demais, a produtora reserva menos dinheiro
 * do que realmente vai dever — o rombo sai do próprio bolso, silenciosamente,
 * em TODO orçamento com imposto > 0 (os 19 que existem hoje, todos).
 *
 * A correção resolve imposto e BV JUNTOS, no mesmo denominador — a mesma
 * fórmula que o sistema legado (OrcamentosLegado/budgetCalc.ts) já usava e
 * que eu, por engano, decidi não reaproveitar ao construir o BV (achei que o
 * imposto atual já estava certo; não estava — ver commit anterior).
 *
 *   baseProtegida = custo + margem + comissões  (precisa sair 100% intacta)
 *   valorTotal    = baseProtegida / (1 - imposto% - bv%)
 *   impostoValue  = imposto% × valorTotal
 *   bvValue       = bv% × valorTotal
 *
 * Por construção: valorTotal − impostoValue − bvValue = baseProtegida.
 */
export function calcularImpostoEBV(
  baseProtegida: number,
  impostoPercent: number,
  bvPercent: number,
): { impostoValue: number; bvValue: number; valorTotal: number } {
  const imp = impostoPercent / 100;
  const bv = bvPercent / 100;
  const denom = 1 - imp - bv;
  // imposto+BV somando 100% ou mais comeriam o orçamento inteiro (ou mais) —
  // devolve sem os dois aplicados em vez de Infinity/valor negativo na tela.
  if (denom <= 0) {
    return { impostoValue: 0, bvValue: 0, valorTotal: baseProtegida };
  }
  const valorTotal = baseProtegida / denom;
  return { impostoValue: imp * valorTotal, bvValue: bv * valorTotal, valorTotal };
}
