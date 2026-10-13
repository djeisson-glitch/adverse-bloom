import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "sessao-de-teste" } } }) } } }));
import { baixarCartaPdf } from "./cartaPdf";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });
describe("PDF das cartas", () => {
 it("gera a carta simples com seu estilo e inicia download", async () => {
  document.body.innerHTML = '<div class="nota">Orçamento simples</div>';
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["PDF"]) });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", { createObjectURL: () => "blob:teste", revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  expect(await baixarCartaPdf("proposta", { seletor: ".nota", style: "body { background: white; }", extra: "" })).toEqual({ ok: true });
  const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(payload.corpo).toContain('class="nota"');
  expect(payload.extra).toBe("");
  expect(click).toHaveBeenCalledTimes(1);
 });
 it("não inicia download quando a geração falha", async () => {
  document.body.innerHTML = '<div class="carta-doc">Proposta</div>';
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "erro" }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  expect((await baixarCartaPdf("proposta")).ok).toBe(false);
  expect(click).not.toHaveBeenCalled();
 });
});
