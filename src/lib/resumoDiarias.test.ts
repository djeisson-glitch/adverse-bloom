import { describe, it, expect } from "vitest";
import { resumoDiariasPorProjeto, rotuloDiarias } from "./resumoDiarias";

describe("diárias existentes dos projetos", () => {
  it("soma meia diária, mantém realizadas e separa os projetos", () => {
    expect(resumoDiariasPorProjeto([
      { project_id: "a", tipo: "diaria", status: "agendada", fracao: 0.5 },
      { project_id: "a", tipo: "diaria", status: "realizada", fracao: 1 },
      { project_id: "b", tipo: "diaria", status: "confirmada", fracao: 1 },
      { project_id: "b", tipo: "diaria", status: "realizada", fracao: null },
    ])).toEqual({ a: 1.5, b: 2 });
  });
  it("ignora cancelamentos, visitas e registros sem projeto", () => {
    expect(resumoDiariasPorProjeto([
      { project_id: "a", tipo: "diaria", status: "cancelada", fracao: 1 },
      { project_id: "a", tipo: "visita_tecnica", status: "realizada", fracao: 1 },
      { project_id: null, tipo: "diaria", status: "realizada", fracao: 1 },
    ])).toEqual({});
  });
  it("apresenta frações sem arredondar e zero sem saldo fictício", () => {
    expect(rotuloDiarias(1.5)).toBe("1,5 diárias registradas");
    expect(rotuloDiarias(1)).toBe("1 diária registrada");
    expect(rotuloDiarias(0)).toBe("0 diárias registradas");
  });
});
