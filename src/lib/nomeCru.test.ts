import { describe, it, expect } from "vitest";
import { cru, formatoCru, nomeDaVinciCru } from "./nomeCru";

/**
 * Os casos vieram dos nomes que estão no banco hoje. O primeiro bloco é o
 * espelho de `public.normalizar_nome_projeto()` — se alguém mudar a régua num
 * lado só, é aqui que aparece.
 */

describe("cru: o que o Mac e o Windows aceitam igual", () => {
  it("tira acento", () => {
    expect(cru("Máquinas de Cartões")).toBe("MAQUINAS_DE_CARTOES");
    expect(cru("Gravações em Cruz Alta e Ijuí")).toBe("GRAVACOES_EM_CRUZ_ALTA_E_IJUI");
    expect(cru("Promoção Pinos e Buchas")).toBe("PROMOCAO_PINOS_E_BUCHAS");
  });

  it("tira espaço, colchete, pipe e travessão — os que quebram caminho", () => {
    expect(cru("[0317] Blitz de Peças")).toBe("0317_BLITZ_DE_PECAS");
    expect(cru("PÓS | Promoção 02")).toBe("POS_PROMOCAO_02");
    expect(cru("Presença — Ijuí")).toBe("PRESENCA_IJUI");
  });

  it("não deixa _ sobrando nas pontas nem repetido no meio", () => {
    expect(cru("  Spot   de   Rádio  ")).toBe("SPOT_DE_RADIO");
    expect(cru("--- Campanha ---")).toBe("CAMPANHA");
  });

  it("aguenta vazio e nulo sem estourar", () => {
    expect(cru("")).toBe("");
    expect(cru(null)).toBe("");
    expect(cru(undefined)).toBe("");
  });

  it("é idempotente — copiar o já cru devolve o mesmo", () => {
    expect(cru(cru("Máquinas de Cartões"))).toBe("MAQUINAS_DE_CARTOES");
  });
});

describe("formato", () => {
  it("normaliza as formas que aparecem no cadastro", () => {
    expect(formatoCru("16×9")).toBe("16X9");
    expect(formatoCru("16 X 9")).toBe("16X9");
    expect(formatoCru("9:16")).toBe("9X16");
    expect(formatoCru("")).toBe("");
  });
});

describe("nome do DaVinci", () => {
  it("compõe código, nome, formato e versão sem espaço nenhum", () => {
    expect(nomeDaVinciCru("ADVR-4036", "Spot de Rádio 01 - Filme Mãe", "16×9"))
      .toBe("ADVR-4036_SPOT_DE_RADIO_01_FILME_MAE_16X9_V1");
  });

  it("mantém o hífen do código — ele é o código, não pontuação", () => {
    expect(nomeDaVinciCru("ADVR-4021", "Institucional")).toBe("ADVR-4021_INSTITUCIONAL_V1");
  });

  it("tira o prefixo interno, que empurrava o fim do nome pra fora", () => {
    expect(nomeDaVinciCru("ADVR-4021", "PÓS | Promoção Pinos e Buchas 02"))
      .toBe("ADVR-4021_PROMOCAO_PINOS_E_BUCHAS_02_V1");
  });

  it("sem formato, não inventa bloco vazio", () => {
    expect(nomeDaVinciCru("ADVR-4001", "Teste", null)).toBe("ADVR-4001_TESTE_V1");
  });

  it("sem código ainda produz nome usável", () => {
    expect(nomeDaVinciCru(null, "Teste de Peça", "16x9")).toBe("TESTE_DE_PECA_16X9_V1");
  });
});
