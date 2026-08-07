import { describe, it, expect } from "vitest";
import { BALDES, balde, rotuloBalde, rotuloCurto, foraDoFechamento } from "./faturamentoBalde";

describe("balde de faturamento", () => {
  it("nulo e desconhecido caem em mensal", () => {
    // Um valor estranho no banco (typo, migração futura) NÃO pode fazer a
    // peça sumir de todas as notas: peça que some é dinheiro não cobrado.
    // O default é o balde que a carta imprime, onde alguém vê e reclama.
    expect(balde(null)).toBe("mensal");
    expect(balde(undefined)).toBe("mensal");
    expect(balde("mensal_separada")).toBe("mensal");
    expect(balde("")).toBe("mensal");
  });

  it("os três valores válidos passam", () => {
    expect(balde("mensal")).toBe("mensal");
    expect(balde("mensal_separado")).toBe("mensal_separado");
    expect(balde("avulso")).toBe("avulso");
  });

  it("só o mensal fica dentro do fechamento", () => {
    expect(foraDoFechamento("mensal")).toBe(false);
    expect(foraDoFechamento(null)).toBe(false);
    expect(foraDoFechamento("mensal_separado")).toBe(true);
    expect(foraDoFechamento("avulso")).toBe(true);
  });

  it("todo balde tem rótulo, e nenhum se repete", () => {
    // Dois baldes com o mesmo texto na tela é o mesmo que não ter os dois.
    const labels = BALDES.map((b) => b.label);
    const curtos = BALDES.map((b) => b.curto);
    expect(new Set(labels).size).toBe(BALDES.length);
    expect(new Set(curtos).size).toBe(BALDES.length);
    expect(rotuloBalde("mensal_separado")).toBe("No mês, em nota separada");
    expect(rotuloCurto("avulso")).toBe("avulso");
  });
});
