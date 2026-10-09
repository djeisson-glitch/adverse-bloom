import { beforeEach, describe, expect, it, vi } from "vitest";
import { aprovarEtapa, pedirAjuste, enviarParaRevisao, aprovarEEnviarCliente } from "./fluxoEntregavel";
import { STATUS_ENTREGAVEL, statusLabel } from "./statusEntregavel";
import { donoDaVez } from "@/components/entregavel/FaixaStatus";
const db = vi.hoisted(() => ({ update: vi.fn(), insert: vi.fn(), eq: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({
  update: db.update, insert: db.insert,
}) } }));
beforeEach(() => {
  vi.clearAllMocks(); db.update.mockReturnValue({ eq: db.eq });
  db.eq.mockResolvedValue({ error: null }); db.insert.mockResolvedValue({ error: null });
});
describe("revisão interna única", () => {
  it.each(["revisao_n1", "revisao", "revisao_n2"])("aprova %s sem criar uma segunda fila", async (status) => {
    await aprovarEtapa({ id: "peca", status }, "maiara");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: "pronto", aprovado_n1_por: "maiara", rev_n1_ajuste: false }));
    expect(db.update.mock.calls[0][0]).not.toHaveProperty("aprovado_n2_por");
  });
  it.each(["revisao_n1", "revisao", "revisao_n2"])("devolve %s diretamente ao editor e registra o pedido", async (status) => {
    await pedirAjuste({ id: "peca", status, revisoes_internas: 2 }, "maiara");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: "ajuste_interno", retrabalho: true, revisoes_internas: 3, rev_n1_ajuste: true }));
    expect(db.insert).toHaveBeenCalledOnce();
  });
  it.each([false, true])("envia a primeira entrega e o retrabalho à mesma aprovadora (%s)", async (retrabalho) => {
    await enviarParaRevisao({ id: "peca", status: "em_edicao", retrabalho });
    expect(["revisao_n1", "revisao"]).toContain(db.update.mock.calls[0][0].status);
  });
  it("preserva o caminho de aprovar e enviar ao cliente", async () => {
    await aprovarEEnviarCliente({ id: "peca", status: "revisao" }, "maiara");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: "com_cliente", aprovado_n1_por: "maiara" }));
  });
  it("não oferece R2 nos seletores e ainda interpreta registros legados", () => {
    expect(STATUS_ENTREGAVEL.some(s => (s.id as string) === "revisao_n2")).toBe(false);
    expect(statusLabel("revisao_n2")).toBe("Revisão interna");
    const profiles = [{ id: "maiara" }, { id: "djeisson" }];
    expect(donoDaVez("revisao_n2", {}, "maiara", "djeisson", profiles).pessoa.id).toBe("maiara");
  });
  it("propaga falha de gravação sem registrar sucesso", async () => {
    db.eq.mockResolvedValueOnce({ error: new Error("Sem acesso") });
    await expect(aprovarEtapa({ id: "peca", status: "revisao_n1" }, "maiara")).rejects.toThrow("Sem acesso");
  });
});
