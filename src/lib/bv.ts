/**
 * BV da agência — a fatia que sai do que o cliente paga ANTES de sobrar
 * dinheiro pra imposto e custo de produção.
 *
 * Djêisson (09/09): "esse BV precisa incluir os impostos que irei pagar, ou
 * seja, se o projeto tem 15% de BV, o cliente irá pagar 10k mas eu ficarei
 * com 8.5k pra cobrir os impostos de 10k + custos de produção."
 *
 * Ou seja: BV não é acréscimo simples sobre a base (como imposto e comissão
 * já funcionam nesta planilha) — é uma fração do TOTAL FINAL. Por isso
 * "embrulha" por fora de tudo que já existe: pega o valor que o orçamento já
 * calcularia sem BV (custo + margem + comissão + imposto, sem tocar em nada
 * disso) e faz o cliente pagar o suficiente a mais pra que, depois de tirado
 * o BV, sobre exatamente esse mesmo valor — intacto, cobrindo o mesmo
 * imposto e o mesmo custo de sempre.
 *
 *   valorComBV = valorAntesBV / (1 - bv%)
 *   bvValue    = valorComBV - valorAntesBV   (= valorComBV × bv%, por construção)
 */
export function calcularBV(
  valorAntesBV: number,
  bvPercent: number,
): { bvValue: number; valorComBV: number } {
  const bv = bvPercent / 100;
  // 0% é o caso comum (a imensa maioria dos projetos não passa por agência).
  // >=100% quebraria a divisão (a fatia de BV comeria o orçamento inteiro e
  // sobraria zero pra imposto/custo) — nesse caso ignora o BV em vez de
  // devolver Infinity/NaN pra tela.
  if (bv <= 0 || bv >= 1) {
    return { bvValue: 0, valorComBV: valorAntesBV };
  }
  const valorComBV = valorAntesBV / (1 - bv);
  return { bvValue: valorComBV - valorAntesBV, valorComBV };
}
