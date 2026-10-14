import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const m = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn(), writeText: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: m.rpc,
  from: () => ({ update: (patch: unknown) => { m.update(patch); return { eq: () => Promise.resolve({ error: null }) }; } }),
} }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canSeeMoney: true }) }));
vi.mock("@/components/orcamento/CompartilharOrcamento", () => ({ CompartilharOrcamento: () => <button>Compartilhar internamente</button> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: m.error } }));

import { AcaoBotoes } from "./OrcamentoEditor";

function setup(stage = "lead", jobGerado?: any) {
  const navigate = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><AcaoBotoes
    deal={{ id: "deal-1", stage, value: 7500 }}
    budget={{ id: "opcao-aberta", variante_nome: "Com drone" }}
    navigate={navigate} qc={qc} jobGerado={jobGerado}
  /></QueryClientProvider>);
  return { navigate };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockResolvedValue({ data: "project-1", error: null });
  m.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: m.writeText } });
});

describe("Ações diretas do orçamento", () => {
  it("mostra envio, PDF, ganhar e perder sem abrir menus", () => {
    setup();
    for (const name of [/Enviar proposta/, /Carta simples \/ PDF/, /^Ganhar$/, /^Perder$/]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("copia a proposta da opção aberta e marca como proposta", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Enviar proposta/ }));
    await waitFor(() => expect(m.writeText).toHaveBeenCalledWith(`${window.location.origin}/carta/project-1`));
    expect(m.rpc).toHaveBeenCalledWith("carta_gerar_token", { _budget_id: "opcao-aberta" });
    expect(m.update).toHaveBeenCalledWith({ stage: "proposta" });
  });
  it("abre o PDF da opção selecionada sem mudar o estágio", () => {
    const { navigate } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Carta simples/ }));
    expect(navigate).toHaveBeenCalledWith("/orcamentos/deal-1/carta-simples?opcao=opcao-aberta");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("ganhar mantém a criação do projeto", async () => {
    const { navigate } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Ganhar$/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/projetos/project-1"));
    expect(m.rpc).toHaveBeenCalledWith("ganhar_orcamento_gerar_job", { _deal_id: "deal-1", _valor_final: 7500 });
  });
  it("perder só altera o negócio após confirmação; cancelar preserva", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /^Perder$/ }));
    expect(m.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Não" }));
    expect(m.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Perder$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sim" }));
    await waitFor(() => expect(m.update).toHaveBeenCalledWith({ stage: "perdido" }));
  });
  it("mantém o PDF acessível em orçamento ganho e perdido", () => {
    setup("perdido");
    expect(screen.getByRole("button", { name: /Carta simples/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Ganhar$/ })).toBeNull();
  });
  it("um orçamento ganho abre o projeto existente em vez de ganhar novamente", () => {
    const { navigate } = setup("aceite", { id: "existing", numero: 123 });
    expect(screen.getByRole("button", { name: /Enviar proposta/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Carta simples/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Job #123 gerado" }));
    expect(navigate).toHaveBeenCalledWith("/projetos/existing");
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
