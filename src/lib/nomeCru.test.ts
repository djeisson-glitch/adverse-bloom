import { describe, it, expect } from "vitest";
import { cru, formatoCru, emBlocos, nomeProjetoPadrao, nomeDaVinci } from "./nomeCru";

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

describe("nome em blocos", () => {
  it("junta com colchete e sem separador — o bloco separa sozinho", () => {
    expect(emBlocos("0318", "LITROS_DE_VANTAGEM")).toBe("[0318][LITROS_DE_VANTAGEM]");
  });

  it("pula bloco vazio em vez de deixar [] no meio", () => {
    expect(emBlocos("ADVR-1", "TESTE", "", "V1")).toBe("[ADVR-1][TESTE][V1]");
    expect(emBlocos("ADVR-1", "TESTE", null, "V1")).toBe("[ADVR-1][TESTE][V1]");
  });
});

describe("nome padrão do projeto", () => {
  // Colchete SÓ no número. Blocos por informação são regra do ENTREGÁVEL —
  // apliquei nos dois por engano em 11/08 e o Djêisson corrigiu no dia
  // seguinte. Estes testes existem pra isso não voltar.
  it("é [numero]_NOME, com underscore no resto", () => {
    expect(nomeProjetoPadrao("0319", "[0319] Promoção Pinos e Buchas"))
      .toBe("[0319]_PROMOCAO_PINOS_E_BUCHAS");
  });

  it("não põe o nome do projeto entre colchetes", () => {
    expect(nomeProjetoPadrao("0318", "Litros de vantagem")).not.toContain("][");
    expect(nomeProjetoPadrao("0318", "Litros de vantagem")).toBe("[0318]_LITROS_DE_VANTAGEM");
  });

  it("não repete o número quando o nome já traz o prefixo — nos dois formatos", () => {
    expect(nomeProjetoPadrao("0317", "[0317] Blitz de Peças")).toBe("[0317]_BLITZ_DE_PECAS");
    expect(nomeProjetoPadrao("0317", "[0317]_BLITZ_DE_PECAS")).toBe("[0317]_BLITZ_DE_PECAS");
  });

  it("sem número ou sem nome, não sobra colchete solto nem underscore órfão", () => {
    expect(nomeProjetoPadrao(null, "Só o nome")).toBe("SO_O_NOME");
    expect(nomeProjetoPadrao("0319", "")).toBe("[0319]");
  });
});

describe("nome do DaVinci", () => {
  it("compõe código, nome, formato e versão em blocos, sem espaço", () => {
    expect(nomeDaVinci("ADVR-4036", "Spot de Rádio 01 - Filme Mãe", "16×9"))
      .toBe("[ADVR-4036][SPOT_DE_RADIO_01_FILME_MAE][16X9][V1]");
  });

  it("mantém o hífen do código — ele é o código, não pontuação", () => {
    expect(nomeDaVinci("ADVR-4021", "Institucional")).toBe("[ADVR-4021][INSTITUCIONAL][V1]");
  });

  it("tira o prefixo interno e o pipe, que o Windows proíbe", () => {
    expect(nomeDaVinci("ADVR-4021", "PÓS | Promoção Pinos e Buchas 02"))
      .toBe("[ADVR-4021][PROMOCAO_PINOS_E_BUCHAS_02][V1]");
  });

  it("sem formato, não inventa bloco vazio", () => {
    expect(nomeDaVinci("ADVR-4001", "Teste", null)).toBe("[ADVR-4001][TESTE][V1]");
  });

  it("sem código ainda produz nome usável", () => {
    expect(nomeDaVinci(null, "Teste de Peça", "16x9")).toBe("[TESTE_DE_PECA][16X9][V1]");
  });

  it("não sobra nenhum caractere proibido pelo Windows", () => {
    const n = nomeDaVinci("ADVR-4036", "PÓS | Spot: Rádio? <Filme>", "9:16");
    expect(n).not.toMatch(/[\\/:*?"<>|]/);
    expect(n).not.toMatch(/\s/);
  });
});
