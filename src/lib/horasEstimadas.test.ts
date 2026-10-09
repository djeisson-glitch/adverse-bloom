import { describe, expect, it } from "vitest";
import { minutosEstimados } from "./horasEstimadas";
describe("estimativa de tarefas extras", () => {
  it("estima 2h30 para 2h de DaVinci preservando o registro", () => {
    const entry = { duration_min: 120, source: "davinci" };
    expect(minutosEstimados([entry])).toBe(150);
    expect(entry.duration_min).toBe(120);
  });
  it("não multiplica horas manuais nem de cronômetro", () => {
    expect(minutosEstimados([{ duration_min: 120, source: "manual" }, { duration_min: 60, source: "timer" }])).toBe(180);
  });
  it("arredonda somente a soma", () => {
    expect(minutosEstimados(Array.from({ length: 4 }, () => ({ duration_min: 1, source: "davinci" })))).toBe(5);
  });
  it("combina DaVinci com lançamentos manuais", () => {
    expect(minutosEstimados([{ duration_min: 120, source: "davinci", time_multiplier: 1.25 }, { duration_min: 30, source: "manual" }])).toBe(180);
  });
});
