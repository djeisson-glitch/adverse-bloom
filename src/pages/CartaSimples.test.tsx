import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const m = vi.hoisted(() => ({ db: {} as Record<string, any[]>, fail: false, pdf: vi.fn(), emissao: vi.fn() }));
vi.mock("@/lib/cartaPdf", () => ({ baixarCartaPdf: m.pdf }));
vi.mock("@/lib/emissaoOrcamento", () => ({ registrarEmissaoPdf: m.emissao }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const filters: [string, any][] = []; let patch: any; let single = false;
  const q: any = new Proxy({}, { get(_, key) {
    if (key === "then") return (resolve: any) => {
      const rows = (m.db[table] || []).filter(row => filters.every(([k, v]) => row[k] === v));
      if (patch && m.fail) return Promise.resolve({error: new Error("Sem conexão"), data: null}).then(resolve);
      if (patch) rows.forEach(row => Object.assign(row, patch));
      return Promise.resolve({data: structuredClone(single ? rows[0] : rows), error: null}).then(resolve);
    };
    return (...args: any[]) => {
      if (key === "eq") filters.push([args[0], args[1]]);
      if (key === "single" || key === "maybeSingle") single = true;
      if (key === "update") patch = args[0];
      return q;
    };
  }}); return q;
} } }));
import CartaSimples from "./CartaSimples";
function abrir() {
  return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={["/orcamentos/d/carta-simples"]}><Routes><Route path="/orcamentos/:id/carta-simples" element={<CartaSimples/>}/></Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  m.fail = false; m.pdf.mockReset().mockResolvedValue({ok:true}); m.emissao.mockReset().mockResolvedValue(undefined);
  m.db = {
    deals: [{id:"d",title:"Campanha",objetivo:"",client:{name:"Cliente",contact_name:"Contato original"}}],
    budgets: [{id:"b",deal_id:"d",total_value:1000,entregas:[],proposta:{briefing:"Texto da carta completa"}}],
    budget_categorias: [{id:"c",codigo:"007",nome:"Equipe",ordem:1}],
    budget_items: [{id:"i",budget_id:"b",categoria_id:"c",descricao:"Câmera",quantity:2,diaria:1,client_unit_price:500}],
  };
});
afterEach(cleanup);
describe("carta simples — edição e exportação", () => {
  it("salva antes de exportar e mantém A/C e textos ao reabrir", async () => {
    const page = abrir();
    await screen.findByText("1 diária");
    fireEvent.click(screen.getByRole("button", {name:"Editar textos e A/C"}));
    fireEvent.change(screen.getByLabelText("A/C — pessoa de contato"), {target:{value:"Mariana"}});
    fireEvent.change(screen.getByLabelText("Descrição do projeto"), {target:{value:"Descrição personalizada"}});
    fireEvent.change(screen.getByLabelText("Condições"), {target:{value:"Pagamento em duas parcelas"}});
    fireEvent.click(screen.getByRole("button", {name:"Editar textos e A/C"}));
    m.pdf.mockImplementation(async () => {
      expect(m.db.budgets[0].proposta.carta_simples.textos.ac).toBe("Mariana");
      expect(document.querySelector(".nota")?.textContent).toContain("Descrição personalizada");
      expect(document.querySelector(".nota")?.textContent).toContain("1 diária");
      return {ok:true};
    });
    fireEvent.click(screen.getByRole("button", {name:"Baixar PDF"}));
    await waitFor(() => expect(m.pdf).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(m.emissao).toHaveBeenCalledTimes(1));
    expect(m.db.budgets[0].proposta.briefing).toBe("Texto da carta completa");
    expect(m.db.deals[0].client.contact_name).toBe("Contato original");
    page.unmount(); abrir();
    await screen.findByText("A/C Mariana");
    expect(screen.getByText("Descrição personalizada")).toBeInTheDocument();
    expect(screen.getByText("Pagamento em duas parcelas")).toBeInTheDocument();
  });
  it("não exporta quando o salvamento falha e permite tentar novamente", async () => {
    abrir(); await screen.findByText("1 diária");
    fireEvent.click(screen.getByRole("button", {name:"Editar textos e A/C"}));
    fireEvent.change(screen.getByLabelText("A/C — pessoa de contato"), {target:{value:"Mariana"}});
    fireEvent.click(screen.getByRole("button", {name:"Editar textos e A/C"}));
    m.fail = true;
    fireEvent.click(screen.getByRole("button", {name:"Baixar PDF"}));
    await screen.findByRole("button", {name:"Tentar salvar novamente"});
    expect(m.pdf).not.toHaveBeenCalled();
    expect(m.emissao).not.toHaveBeenCalled();
    m.fail = false;
    fireEvent.click(screen.getByRole("button", {name:"Baixar PDF"}));
    await waitFor(() => expect(m.pdf).toHaveBeenCalledTimes(1));
  });
});
