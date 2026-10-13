import { describe, it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({ stored: {} as any, fail: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  let patch: any;
  const q: any = { select: () => q, eq: () => q, update: (value: any) => { patch = value; return q; }, single: async () => {
    if (patch && m.fail) return {error: new Error("RLS")};
    if (patch) m.stored = patch.proposta;
    return {data: patch ? {id: "a"} : {proposta: structuredClone(m.stored)}, error: null};
  }};
  return q;
}} }));
import { salvarPropostaCampos } from "./salvarProposta";
beforeEach(() => { m.stored = {}; m.fail = false; });
it("salva a simples sem apagar a completa e preserva a simples ao editar a completa", async () => {
  m.stored = {briefing: "Briefing completo", entregas_texto: "Vídeo"};
  await salvarPropostaCampos("a", {carta_simples: {textos: {ac: "Maria"}}});
  expect(m.stored.briefing).toBe("Briefing completo");
  await salvarPropostaCampos("a", {briefing: "Novo briefing"});
  expect(m.stored.carta_simples.textos.ac).toBe("Maria");
});
it("não confirma salvamento se a atualização falhar", async () => {
  m.fail = true;
  await expect(salvarPropostaCampos("a", {carta_simples: {}})).rejects.toThrow("RLS");
});
