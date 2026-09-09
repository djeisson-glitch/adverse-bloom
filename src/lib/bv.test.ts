import { describe, it, expect } from "vitest";
import { calcularBV } from "./bv";

/**
 * Djêisson (09/09): "se o projeto tem 15% de BV, o cliente irá pagar 10k mas
 * eu ficarei com 8.5k pra cobrir os impostos de 10k + custos de produção."
 * Este é o caso de referência — os outros testam as bordas dele.
 */
describe("calcularBV", () => {
  it("reproduz o exemplo exato do Djêisson: 15% de BV sobre 8.5k vira 10k", () => {
    const { bvValue, valorComBV } = calcularBV(8500, 15);
    expect(valorComBV).toBeCloseTo(10000, 6);
    expect(bvValue).toBeCloseTo(1500, 6);
  });

  it("0% não muda nada — é o caso da imensa maioria dos projetos", () => {
    expect(calcularBV(8500, 0)).toEqual({ bvValue: 0, valorComBV: 8500 });
  });

  it("o que sobra depois do BV é EXATAMENTE o valor de antes — nem mais, nem menos", () => {
    // É o ponto central do pedido: o BV não pode comer nem um centavo do que
    // já estava reservado pra imposto e custo de produção.
    const antes = 12345.67;
    const { bvValue, valorComBV } = calcularBV(antes, 22);
    expect(valorComBV - bvValue).toBeCloseTo(antes, 6);
  });

  it("BV >= 100% não estoura em Infinity/NaN — ignora o BV com segurança", () => {
    expect(calcularBV(8500, 100)).toEqual({ bvValue: 0, valorComBV: 8500 });
    expect(calcularBV(8500, 150)).toEqual({ bvValue: 0, valorComBV: 8500 });
  });

  it("BV negativo (não deveria acontecer na tela, mas não pode quebrar o cálculo)", () => {
    expect(calcularBV(8500, -10)).toEqual({ bvValue: 0, valorComBV: 8500 });
  });
});
