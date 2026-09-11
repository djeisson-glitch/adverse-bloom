import { describe, it, expect } from "vitest";
import { entregasParaTexto, entregasDesatualizadas } from "./entregasTexto";

describe("entregasParaTexto", () => {
  it("escreve uma por linha, no formato da carta", () => {
    expect(entregasParaTexto([
      { titulo: "Filme principal", formato: "16x9", duracao: "60s", quantidade: 1 },
      { titulo: "Corte para Reels", formato: "9x16", duracao: "30s", quantidade: 3 },
      { titulo: "Fotos tratadas", quantidade: 20 },
    ])).toBe("01 Filme principal 60s | 16x9\n03 Corte para Reels 30s | 9x16\n20 Fotos tratadas");
  });

  it("bate com o texto que a carta completa já gerava (JD1, real)", () => {
    expect(entregasParaTexto([{ titulo: "Filme principal", formato: "16x9", duracao: '90"', quantidade: 1 }]))
      .toBe('01 Filme principal 90" | 16x9');
  });

  it("ignora entrega sem título e lista que não é lista", () => {
    expect(entregasParaTexto([{ titulo: "  ", quantidade: 2 }, null, { titulo: "Teaser" }])).toBe("01 Teaser");
    expect(entregasParaTexto(null)).toBe("");
    expect(entregasParaTexto({})).toBe("");
  });
});

describe("entregasDesatualizadas", () => {
  const entregas = [{ titulo: "Filme personas", formato: "16x9", duracao: "15s", quantidade: 5 }];

  it("avisa quando a carta ficou pra trás (VESTIBULAR: 04 na carta, 05 no orçamento)", () => {
    expect(entregasDesatualizadas("04 Filme personas 15s | 16x9", entregas)).toBe(true);
  });
  it("não avisa quando bate", () => {
    expect(entregasDesatualizadas("05 Filme personas 15s | 16x9\n", entregas)).toBe(false);
  });
  it("não avisa quando o orçamento não tem entregas — o texto à mão é a fonte", () => {
    expect(entregasDesatualizadas("Íntegra das palestras em 2 câmeras", [])).toBe(false);
  });
});
