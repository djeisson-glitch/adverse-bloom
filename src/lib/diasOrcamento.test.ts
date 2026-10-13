import { describe, expect, it } from "vitest";
import { diasOrcamento } from "./diasOrcamento";
describe("dias do orçamento", () => {
 it("usa o calendário de São Paulo", () => expect(diasOrcamento("2026-10-12T23:00:00-03:00", "2026-10-13T01:00:00-03:00")).toBe(1));
 it("mede o prazo até aprovação", () => expect(diasOrcamento("2026-10-01T12:00:00Z", "2026-10-13T12:00:00Z")).toBe(12));
 it("não inventa data de registros antigos", () => expect(diasOrcamento(null)).toBeNull());
 it("não mostra prazo negativo", () => expect(diasOrcamento("2026-10-13T12:00:00Z", "2026-10-12T12:00:00Z")).toBe(0));
});
