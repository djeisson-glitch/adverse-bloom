import { describe, it, expect } from "vitest";
import { orcamentoDaCarta } from "./orcamentoDaCarta";

/**
 * O caso do Djêisson (20/08): "a separação das versões ainda não ta rolando na
 * hora de montar a carta". A variante é SEMPRE mais nova que o principal —
 * ela nasce como cópia dele —, então "o mais recente" escolhe justamente a
 * errada.
 */

const principal = { id: "p", parent_budget_id: null, is_latest_version: true, created_at: "2026-08-01T10:00:00Z" };
const comDrone = { id: "a", parent_budget_id: "p", is_latest_version: true, created_at: "2026-08-20T10:00:00Z", variante_nome: "Com drone" };
const semDrone = { id: "b", parent_budget_id: "p", is_latest_version: true, created_at: "2026-08-20T11:00:00Z", variante_nome: "Sem drone" };
const todos = [principal, comDrone, semDrone];

describe("qual orçamento a carta representa", () => {
  it("respeita a opção aberta na tela", () => {
    expect(orcamentoDaCarta(todos, "a")?.id).toBe("a");
    expect(orcamentoDaCarta(todos, "b")?.id).toBe("b");
  });

  it("sem opção, usa o PRINCIPAL — não o mais recente", () => {
    // O bug em uma linha: a variante é sempre mais nova que o principal.
    expect(orcamentoDaCarta(todos)?.id).toBe("p");
    expect(orcamentoDaCarta(todos)?.id).not.toBe("b");
  });

  it("opção que não existe mais cai no principal, não em outra qualquer", () => {
    expect(orcamentoDaCarta(todos, "apagada")?.id).toBe("p");
  });

  it("ignora versão antiga do principal", () => {
    const v1 = { id: "v1", parent_budget_id: null, is_latest_version: false, created_at: "2026-09-01T10:00:00Z" };
    expect(orcamentoDaCarta([...todos, v1])?.id).toBe("p");
  });

  it("sem nada, devolve null em vez de estourar", () => {
    expect(orcamentoDaCarta([], "x")).toBeNull();
  });
});
