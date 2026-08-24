import { describe, it, expect } from "vitest";
import { listaDoProjeto } from "./fechamentoFila";

describe("em que lista o projeto cai", () => {
  it("entregue e não fechado é o que pede ação", () => {
    expect(listaDoProjeto("entregue", false)).toBe("fila");
  });

  it("fechado mas ainda não faturado vai SÓ pro arquivo", () => {
    // O bug que motivou extrair isto: a tela antiga colocava esse caso em
    // "em previsão" (status !== faturado) E em "fechados" (tem closure) —
    // o projeto aparecia duas vezes, uma delas com botão de fechar de novo.
    expect(listaDoProjeto("entregue", true)).toBe("arquivo");
    expect(listaDoProjeto("producao", true)).toBe("arquivo");
  });

  it("faturado é arquivo mesmo sem snapshot", () => {
    expect(listaDoProjeto("faturado", false)).toBe("arquivo");
  });

  it("quem ainda produz não entra na fila de fechamento", () => {
    for (const s of ["orcamento", "briefing", "aprovado", "producao", "revisao"]) {
      expect(listaDoProjeto(s, false)).toBe("andamento");
    }
  });

  it("cancelado não aparece em lugar nenhum", () => {
    expect(listaDoProjeto("cancelado", false)).toBe("fora");
    expect(listaDoProjeto("cancelado", true)).toBe("fora");
  });

  it("status desconhecido não some — cai em andamento", () => {
    // Status novo no banco não pode fazer projeto desaparecer da tela:
    // projeto que some é dinheiro que ninguém fecha.
    expect(listaDoProjeto("status_que_ainda_nao_existe", false)).toBe("andamento");
  });
});
