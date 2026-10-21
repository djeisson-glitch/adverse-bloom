/** Preço da tabela é o preço final. Taxas são parcelas internas, nunca acréscimos. */
export type ComissaoTabela = { nome: string; tipo: "%" | "R$"; valor: number };
export type TaxasTabela = { margem: number; imposto: number; bv: number; comissoes: ComissaoTabela[] };
export const moeda = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function decomporPrecoFinal(total: number, baseMargem: number, taxas: TaxasTabela) {
  const valorFinal = moeda(total);
  const margem = moeda(baseMargem * taxas.margem / 100);
  const imposto = moeda(valorFinal * taxas.imposto / 100);
  const bv = moeda(valorFinal * taxas.bv / 100);
  const comissao = moeda(taxas.comissoes.reduce((s, c) => s +
    (c.tipo === "%" ? valorFinal * Number(c.valor) / 100 : Number(c.valor)), 0));
  return { total: valorFinal, margem, imposto, bv, comissao,
    base: moeda(valorFinal - margem - imposto - bv - comissao) };
}

// Comissões fixas são rateadas proporcionalmente entre as linhas ativas.
export function fatorLiquidoTabela(total: number, taxas: TaxasTabela) {
  const percent = taxas.comissoes.filter(c => c.tipo === "%").reduce((s,c) => s + Number(c.valor), 0);
  const fixas = taxas.comissoes.filter(c => c.tipo === "R$").reduce((s,c) => s + Number(c.valor), 0);
  return 1 - (taxas.imposto + taxas.bv + percent) / 100 - (total > 0 ? fixas / total : 0);
}
