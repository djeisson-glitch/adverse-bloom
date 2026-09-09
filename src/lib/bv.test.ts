import { describe, it, expect } from "vitest";
import { calcularImpostoEBV } from "./bv";

/**
 * Caso de referência: a análise que o Djêisson trouxe (09/09) mostrando que
 * "sobre sub-total 2 + comissões" tributava uma base menor que a nota fiscal
 * de verdade. 12% de imposto + 15% de BV sobre uma base protegida de 5.750.
 */
describe("calcularImpostoEBV", () => {
  it("reproduz a conta corrigida: base 5.750, imposto 12%, BV 15% → total 7.876,71", () => {
    const { impostoValue, bvValue, valorTotal } = calcularImpostoEBV(5750, 12, 15);
    expect(valorTotal).toBeCloseTo(7876.71, 1);
    expect(impostoValue).toBeCloseTo(945.21, 1);
    expect(bvValue).toBeCloseTo(1181.51, 1);
  });

  it("o que sobra depois de imposto e BV é EXATAMENTE a base protegida", () => {
    // A propriedade central: nem imposto nem BV podem comer a base.
    const base = 12345.67;
    const { impostoValue, bvValue, valorTotal } = calcularImpostoEBV(base, 11.5, 8);
    expect(valorTotal - impostoValue - bvValue).toBeCloseTo(base, 6);
  });

  it("só imposto, sem BV — o caso de 19 dos 19 orçamentos hoje", () => {
    // Antes: imposto = base × 12% (base pequena demais). Agora: imposto sai
    // do valor FINAL, que é maior — por isso o total sobe em relação ao
    // cálculo antigo. É a correção, não uma regressão.
    const { impostoValue, valorTotal } = calcularImpostoEBV(5089.29, 12, 0);
    expect(valorTotal).toBeCloseTo(5783.28, 1);
    expect(impostoValue).toBeCloseTo(694.0, 0);
  });

  it("0% e 0% não muda nada", () => {
    expect(calcularImpostoEBV(8500, 0, 0)).toEqual({ impostoValue: 0, bvValue: 0, valorTotal: 8500 });
  });

  it("imposto + BV somando 100% ou mais não estoura em Infinity/negativo", () => {
    expect(calcularImpostoEBV(8500, 60, 45)).toEqual({ impostoValue: 0, bvValue: 0, valorTotal: 8500 });
    expect(calcularImpostoEBV(8500, 100, 0)).toEqual({ impostoValue: 0, bvValue: 0, valorTotal: 8500 });
  });
});
