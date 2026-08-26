import { describe, it, expect } from "vitest";
import { nomeArquivoProposta } from "./produtora";

/**
 * Djêisson (26/08): "ao exportar as propostas, elas venham com nome único, se
 * não fica parecendo que é a mesma". Este arquivo vira o anexo na mesa do
 * cliente — se dois saem iguais, ele abre um e acha que viu os dois.
 */
describe("nome do arquivo da proposta", () => {
  it("negócio com uma opção só não ganha letra", () => {
    expect(nomeArquivoProposta("EVENTO_RAIZ", "0329"))
      .toBe("[0329] EVENTO_RAIZ - Proposta Adverse");
  });

  it("opções do mesmo negócio saem DIFERENTES", () => {
    const a = nomeArquivoProposta("EVENTO_RAIZ", "0329", { letra: "A" });
    const b = nomeArquivoProposta("EVENTO_RAIZ", "0329", { letra: "B", nome: "Com pós-produção" });
    expect(a).toBe("[0329A] EVENTO_RAIZ - Proposta Adverse");
    expect(b).toBe("[0329B] EVENTO_RAIZ - Com pós-produção - Proposta Adverse");
    expect(a).not.toBe(b); // o ponto inteiro do pedido
  });

  it("caractere que quebra o Finder não passa", () => {
    // "/" viraria pasta; ":" quebra o download no Mac.
    expect(nomeArquivoProposta("A/B", "0329", { nome: "3:1" }))
      .toBe("[0329] A-B - 3-1 - Proposta Adverse");
  });

  it("sem número, não inventa colchete vazio", () => {
    expect(nomeArquivoProposta("EVENTO_RAIZ")).toBe("EVENTO_RAIZ - Proposta Adverse");
  });
});
