import { describe, it, expect } from "vitest";
import { JANELA_RENOMEAR_MIN, minutosRestantes, dentroDaJanela } from "./renomearProjeto";

/**
 * A janela vive em dois lugares — aqui e em
 * `public.janela_renomear_minutos()`. O primeiro teste é o alarme de quando
 * alguém mudar só um lado.
 */

const agora = new Date("2026-08-11T20:00:00Z").getTime();
const minAtras = (m: number) => new Date(agora - m * 60000).toISOString();

describe("janela de renomear", () => {
  it("são 30 minutos", () => expect(JANELA_RENOMEAR_MIN).toBe(30));

  it("recém-criado tem a janela inteira", () => {
    expect(minutosRestantes(minAtras(0), agora)).toBe(30);
    expect(dentroDaJanela(minAtras(0), agora)).toBe(true);
  });

  it("conta o que falta enquanto o tempo passa", () => {
    expect(minutosRestantes(minAtras(10), agora)).toBe(20);
    expect(minutosRestantes(minAtras(29), agora)).toBe(1);
  });

  it("fecha exatamente aos 30 — o limite não fica aberto por arredondamento", () => {
    expect(minutosRestantes(minAtras(30), agora)).toBe(0);
    expect(dentroDaJanela(minAtras(30), agora)).toBe(false);
  });

  it("projeto antigo está fechado", () => {
    expect(dentroDaJanela(minAtras(60 * 24), agora)).toBe(false);
  });

  it("sem data ou com data inválida, trata como fechado — na dúvida, não deixa renomear", () => {
    expect(dentroDaJanela(null, agora)).toBe(false);
    expect(dentroDaJanela(undefined, agora)).toBe(false);
    expect(dentroDaJanela("não é data", agora)).toBe(false);
  });
});
