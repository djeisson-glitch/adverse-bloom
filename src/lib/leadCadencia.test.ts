import { describe, it, expect } from "vitest";
import { cadenciaDias, proximoToquePadrao, diasDeAtraso, rotuloAtraso } from "./leadCadencia";
import { emDiasISO, hojeISO } from "./dataLocal";

/**
 * Esta régua vive em dois lugares — aqui e em `public.lead_cadencia_dias()`.
 * Os três primeiros testes são o alarme de quando alguém mudar só um lado.
 */

describe("cadência por temperatura", () => {
  // 30/60/75 desde 14/08. Os números anteriores (7/21/30) eram meus; o
  // Djêisson usou duas semanas e viu que voltar num frio a cada 30 dias é
  // perseguição, não nutrição.
  it("quente volta em 30 dias", () => expect(cadenciaDias("quente")).toBe(30));
  it("morno volta em 60 dias", () => expect(cadenciaDias("morno")).toBe(60));
  it("frio volta em 75 dias", () => expect(cadenciaDias("frio")).toBe(75));

  it("temperatura desconhecida cai no mais frouxo — na dúvida, cobrar menos", () => {
    expect(cadenciaDias("morninho")).toBe(75);
    expect(cadenciaDias(null)).toBe(75);
    expect(cadenciaDias(undefined)).toBe(75);
  });
});

describe("data sugerida no formulário", () => {
  it("é hoje + a cadência da temperatura", () => {
    expect(proximoToquePadrao("quente")).toBe(emDiasISO(30));
    expect(proximoToquePadrao("frio")).toBe(emDiasISO(75));
  });
});

describe("atraso do toque", () => {
  const hoje = hojeISO();

  it("vencendo hoje não é atraso", () => {
    expect(diasDeAtraso(hoje, hoje)).toBe(0);
    expect(rotuloAtraso(hoje, hoje)).toBe("hoje");
  });

  it("conta os dias desde a data combinada", () => {
    expect(diasDeAtraso(emDiasISO(-3), hoje)).toBe(3);
    expect(rotuloAtraso(emDiasISO(-3), hoje)).toBe("3 dias atrasado");
    expect(rotuloAtraso(emDiasISO(-1), hoje)).toBe("1 dia atrasado");
  });

  it("toque no futuro não vira atraso negativo", () => {
    expect(diasDeAtraso(emDiasISO(10), hoje)).toBe(0);
  });

  it("lead sem data não está atrasado", () => {
    expect(diasDeAtraso(null, hoje)).toBe(0);
  });
});
