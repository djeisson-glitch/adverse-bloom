import { describe, it, expect } from "vitest";
import {
  pecasDoPeriodo, alteracoesDoPeriodo, contarEntregues, horasDoPeriodo,
} from "./fechamentoCliente";

/**
 * Os casos aqui saíram da auditoria de julho/2026 do Sicredi Sul Minas, onde
 * a carta mostrava 3 alterações no resumo e listava 2 na tabela. Cada teste
 * é uma pergunta que o cliente poderia fazer olhando o documento.
 */

const noMes = new Set(["p1", "p2", "p3"]);          // peças criadas no período
const foraDoMes = "p9";                              // peça de outro mês

describe("recorte das peças", () => {
  it("entra quem foi criado no período — a data do pedido não conta", () => {
    const r = pecasDoPeriodo([{ id: "p1" }, { id: foraDoMes }], noMes);
    expect(r.map((x) => x.id)).toEqual(["p1"]);
  });
});

describe("recorte das alterações", () => {
  it("alteração segue a PEÇA, não a data em que foi pedida", () => {
    // Caso real: ADVR-4007 e ADVR-4306 são peças de julho e tiveram alteração
    // pedida em 05/08. A hora delas é cobrada em julho — a alteração também.
    const alts = [
      { id: "a1", deliverable_id: "p1" },   // pedida em julho
      { id: "a2", deliverable_id: "p2" },   // pedida em AGOSTO, peça de julho
    ];
    const pecas = [{ id: "p1" }, { id: "p2" }];
    expect(alteracoesDoPeriodo(alts, pecas).map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("alteração de peça de OUTRO mês não entra, mesmo pedida dentro do mês", () => {
    // Caso real: ADVR-4298 é peça de junho, alteração pedida em 30/07. Era ela
    // que fazia o resumo dizer 3 e a tabela listar 2.
    const alts = [{ id: "a1", deliverable_id: "p1" }, { id: "a3", deliverable_id: foraDoMes }];
    expect(alteracoesDoPeriodo(alts, [{ id: "p1" }]).map((a) => a.id)).toEqual(["a1"]);
  });

  it("o número do resumo é o mesmo que a soma das linhas", () => {
    const pecas = [{ id: "p1" }, { id: "p2" }, { id: foraDoMes }];
    const alts = [
      { id: "a1", deliverable_id: "p1" },
      { id: "a2", deliverable_id: "p1" },
      { id: "a3", deliverable_id: "p2" },
      { id: "a4", deliverable_id: foraDoMes },
    ];
    const doPeriodo = pecasDoPeriodo(pecas, noMes);
    const resumo = alteracoesDoPeriodo(alts, doPeriodo).length;
    const somaDasLinhas = doPeriodo.reduce(
      (s, p) => s + alteracoesDoPeriodo(alts, doPeriodo).filter((a) => a.deliverable_id === p.id).length, 0);
    expect(resumo).toBe(somaDasLinhas);
    expect(resumo).toBe(3);
  });
});

describe("entregues × em andamento", () => {
  it("conta só o que fechou de verdade", () => {
    const pecas = [
      { id: "p1", status: "entregue" }, { id: "p2", status: "aprovado" },
      { id: "p3", status: "em_edicao" },
    ];
    expect(contarEntregues(pecas)).toBe(2);
  });

  it("status desconhecido não vira entregue por engano", () => {
    expect(contarEntregues([{ id: "p1", status: null }, { id: "p2" }])).toBe(0);
  });
});

describe("recorte das horas", () => {
  const doProjeto = (id?: string | null) => id === "projJulho";

  it("hora presa a uma peça segue a peça, não o dia do apontamento", () => {
    const horas = [
      { deliverable_id: "p1", billable: true },       // peça de julho
      { deliverable_id: foraDoMes, billable: true },  // peça de outro mês
    ];
    expect(horasDoPeriodo(horas, noMes, doProjeto)).toHaveLength(1);
  });

  it("hora solta no projeto segue a criação do projeto", () => {
    const horas = [
      { deliverable_id: null, project_id: "projJulho", billable: true },
      { deliverable_id: null, project_id: "projJunho", billable: true },
    ];
    expect(horasDoPeriodo(horas, noMes, doProjeto)).toHaveLength(1);
  });

  it("hora não faturável fica de fora em qualquer caso", () => {
    const horas = [{ deliverable_id: "p1", billable: false }];
    expect(horasDoPeriodo(horas, noMes, doProjeto)).toHaveLength(0);
  });
});

describe("o resumo nunca conta o que a tabela não lista", () => {
  it("peça de outro CLIENTE no índice global não entra na conta", () => {
    // O erro real: a tela passou o índice de tudo criado no mês no sistema
    // inteiro. O resumo disse 22 alterações com 4 listadas. Passando as peças
    // DA CARTA, o conjunto errado deixa de ser representável.
    const pecasDaCarta = [{ id: "p1" }];
    const alts = [
      { id: "a1", deliverable_id: "p1" },
      { id: "outroCliente", deliverable_id: "zzz" },
    ];
    const r = alteracoesDoPeriodo(alts, pecasDaCarta);
    expect(r).toHaveLength(1);
    expect(r.every((a) => pecasDaCarta.some((p) => p.id === a.deliverable_id))).toBe(true);
  });
});
