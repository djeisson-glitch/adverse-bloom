import { describe, it, expect } from "vitest";
import { encurtarNome, nomeDeEntregavel, nomeDeProjeto } from "./nomeCurto";

/**
 * Casos tirados da base real (Entregas do mês de julho/2026). O que estes
 * testes protegem é o limite: a regra corta redundância, e só. Nome que perde
 * significado ao ser cortado é bug pior que nome comprido.
 */

const SUL = "Sicredi Sul Minas RS/MG";
const REGIAO = "Sicredi Região da Produção RS/SC/MG";

describe("encurtar nome de peça", () => {
  it("tira o cliente do fim, que a tela já mostra em cima", () => {
    expect(encurtarNome("Vídeo Paulo Herrmann Sul Minas", SUL)).toBe("Paulo Herrmann");
  });

  it("tira a sigla do estado — 2 letras, mas é nome de cliente", () => {
    expect(encurtarNome("Encontro com Associados MG", SUL)).toBe("Encontro com Associados");
  });

  it("tira 'vídeo' com e sem acento", () => {
    expect(encurtarNome("Vídeo 2 Plano Safra", SUL)).toBe("2 Plano Safra");
    expect(encurtarNome("Video Dia do Amigo", SUL)).toBe("Dia do Amigo");
  });

  it("NÃO tira 'fotos' — é o que distingue a peça, não ruído", () => {
    expect(encurtarNome("Fotos do Encontro Sul Minas", SUL)).toBe("Fotos do Encontro");
    expect(encurtarNome("Vídeo e Fotos Plano Safra", SUL)).toBe("e Fotos Plano Safra");
  });

  it("nome que só tinha ruído volta inteiro — vazio é pior que comprido", () => {
    expect(encurtarNome("Vídeo", SUL)).toBe("Vídeo");
    expect(encurtarNome("Sicredi Sul Minas", SUL)).toBe("Sicredi Sul Minas");
  });

  it("não mexe em nome que já é só conteúdo", () => {
    expect(encurtarNome("Linhas de crédito", SUL)).toBe("Linhas de crédito");
  });

  it("sem cliente informado, ainda tira o ruído", () => {
    expect(encurtarNome("Vídeo Institucional", null)).toBe("Institucional");
  });

  it("ligação do nome do cliente não vira palavra proibida", () => {
    // "da"/"de" vêm de "Sicredi Região DA Produção" — se contassem, o título
    // perderia preposição e viraria telegrama.
    expect(encurtarNome("Bastidores da Colheita", REGIAO)).toBe("Bastidores da Colheita");
  });
});

describe("nome de projeto", () => {
  it("preserva o separador de underline da convenção", () => {
    expect(nomeDeProjeto("#20260907_VIDEO_PAULO_HERRMANN_SUL_MINAS", SUL))
      .toBe("#20260907_PAULO_HERRMANN");
  });

  it("mantém o código entre colchetes intacto", () => {
    expect(nomeDeProjeto("[0226]_LINHAS_DE_CREDITO", SUL)).toBe("[0226]_LINHAS_DE_CREDITO");
  });
});

describe("prefixo PÓS", () => {
  it("entra sozinho quando esquecem de digitar", () => {
    expect(nomeDeEntregavel("Plano Safra vídeo 3", SUL)).toBe("PÓS | Plano Safra 3");
  });

  it("não duplica quando já veio", () => {
    expect(nomeDeEntregavel("PÓS | Linhas de crédito", SUL)).toBe("PÓS | Linhas de crédito");
  });

  it("normaliza a forma sem acento e sem espaço", () => {
    expect(nomeDeEntregavel("POS|Linhas de crédito", SUL)).toBe("PÓS | Linhas de crédito");
  });

  it("respeita outra frente de trabalho", () => {
    expect(nomeDeEntregavel("PROD | Diária de captação", SUL)).toBe("PROD | Diária de captação");
  });

  it("título vazio não vira só prefixo", () => {
    expect(nomeDeEntregavel("   ", SUL)).toBe("");
  });
});
