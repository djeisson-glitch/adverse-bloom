import { describe, it, expect } from "vitest";
import {
  type CAItem, NAO_E_RECEITA, EXCLUDED_FROM_MARGIN,
  calcReceitaTotal, calcDespesasOperacionais, getCat,
} from "./financial";

/**
 * Trava as definições de receita e despesa contra os números REAIS de agosto de
 * 2026, conferidos lançamento a lançamento no export bruto do Conta Azul.
 *
 * A tela mostrava faturamento de R$ 37.435,11 e resultado de −R$ 17.222,68. O
 * export dizia que a receita de verdade era R$ 31.154,47: a diferença eram
 * estornos contados como venda. E R$ 16.758 de distribuição de lucros entravam
 * como despesa operacional, quando são destinação do resultado.
 *
 * Os dois erros juntos davam um prejuízo 133% maior do que o real.
 */

const AGOSTO = { from: "2026-08-01", to: "2026-08-31" };
const item = (total: number, cat: string, data = "2026-08-10"): CAItem => ({
  total, data_competencia: data, data_vencimento: data, categorias: [{ nome: cat }],
});

// agosto/2026, como está no export
const RECEBER: CAItem[] = [
  item(19312.62, "Receitas de Serviços", "2026-08-12"),
  item(6100.00, "Produção de conteúdo", "2026-08-01"),
  item(5194.93, "Receitas de Serviços"),
  item(546.92, "Receitas de Serviços"),
  item(6279.84, "Estorno", "2026-08-19"),
  item(0.74, "Estorno", "2026-08-01"),
  item(0.06, "Estorno", "2026-08-17"),
];

describe("o que conta como receita", () => {
  it("estorno não é venda", () => {
    // 6.280,64 de estorno em agosto: 16,8% inflando o faturamento da tela.
    expect(NAO_E_RECEITA).toContain("Estorno");
    expect(calcReceitaTotal(RECEBER, AGOSTO)).toBeCloseTo(31154.47, 2);
  });

  it("captação de empréstimo é dívida, não faturamento", () => {
    const comEmprestimo = [...RECEBER, item(50000, "Empréstimos de Bancos")];
    expect(calcReceitaTotal(comEmprestimo, AGOSTO)).toBeCloseTo(31154.47, 2);
  });

  it("venda de equipamento usado e PIX do sócio não são receita", () => {
    const com = [...RECEBER, item(3519.39, "Outras entradas não operacionais")];
    expect(calcReceitaTotal(com, AGOSTO)).toBeCloseTo(31154.47, 2);
  });

  it("as receitas de verdade continuam entrando", () => {
    for (const c of ["Produção de conteúdo", "Receitas de Serviços", "Produção de comerciais", "Podcast", "Eventos"]) {
      expect(NAO_E_RECEITA).not.toContain(c);
    }
  });
});

describe("o que conta como despesa do período", () => {
  it("distribuição de lucros é destinação, não custo", () => {
    // Sozinha respondia por R$ 16.758 de "despesa" em agosto.
    expect(EXCLUDED_FROM_MARGIN).toContain("Distribuição de Lucros");
    const pagar = [item(10000, "Softwares operacionais"), item(16758, "Distribuição de Lucros")];
    expect(calcDespesasOperacionais(pagar, AGOSTO)).toBeCloseTo(10000, 2);
  });

  it("amortização de empréstimo e compra de equipamento ficam de fora", () => {
    const pagar = [
      item(10000, "Softwares operacionais"),
      item(2877.05, "Empréstimos de Bancos"),
      item(4225, "Compra de equipamentos"),
    ];
    expect(calcDespesasOperacionais(pagar, AGOSTO)).toBeCloseTo(10000, 2);
  });

  it("juros pagos SÃO despesa — é o único pedaço do empréstimo que custa", () => {
    expect(EXCLUDED_FROM_MARGIN).not.toContain("Juros pagos");
    const pagar = [item(10000, "Softwares operacionais"), item(88, "Juros pagos")];
    expect(calcDespesasOperacionais(pagar, AGOSTO)).toBeCloseTo(10088, 2);
  });

  it("pró-labore continua sendo despesa — é remuneração de trabalho", () => {
    expect(EXCLUDED_FROM_MARGIN).not.toContain("Pró-labore");
  });
});

describe("o resultado de agosto, com as duas correções", () => {
  it("sai de −17.222,68 para −7.386,54", () => {
    const pagar = [
      item(38541.01, "Softwares operacionais"),   // despesa operacional real do mês
      item(16758, "Distribuição de Lucros"),
      item(2877.05, "Empréstimos de Bancos"),
    ];
    const receita = calcReceitaTotal(RECEBER, AGOSTO);
    const despesa = calcDespesasOperacionais(pagar, AGOSTO);
    expect(receita - despesa).toBeCloseTo(-7386.54, 2);
  });
});

describe("getCat", () => {
  it("item sem categoria não quebra nem vira receita fantasma", () => {
    expect(getCat({ total: 100 })).toBe("Sem categoria");
    expect(calcReceitaTotal([{ total: 100, data_competencia: "2026-08-05" }], AGOSTO)).toBe(100);
  });
});
