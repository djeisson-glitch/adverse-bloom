import { describe, it, expect } from "vitest";
import { cadenciaDias, proximoToquePadrao, diasDeAtraso, rotuloAtraso } from "./leadCadencia";
import { emDiasISO, hojeISO } from "./dataLocal";

/**
 * Esta régua vive em dois lugares — aqui e em `public.lead_cadencia_dias()`.
 * Os três primeiros testes são o alarme de quando alguém mudar só um lado.
 */

describe("cadência por temperatura", () => {
  it("quente volta em 7 dias", () => expect(cadenciaDias("quente")).toBe(7));
  it("morno volta em 21 dias", () => expect(cadenciaDias("morno")).toBe(21));
  it("frio volta em 30 dias", () => expect(cadenciaDias("frio")).toBe(30));

  it("temperatura desconhecida cai no mais frouxo — na dúvida, cobrar menos", () => {
    expect(cadenciaDias("morninho")).toBe(30);
    expect(cadenciaDias(null)).toBe(30);
    expect(cadenciaDias(undefined)).toBe(30);
  });
});

describe("data sugerida no formulário", () => {
  it("é hoje + a cadência da temperatura", () => {
    expect(proximoToquePadrao("quente")).toBe(emDiasISO(7));
    expect(proximoToquePadrao("frio")).toBe(emDiasISO(30));
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
