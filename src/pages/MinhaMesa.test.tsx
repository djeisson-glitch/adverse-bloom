import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import MinhaMesa from "./MinhaMesa";

const mocks = vi.hoisted(() => ({ data: {} as Record<string, any>, patch: vi.fn(), start: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => ({ data: mocks.data[queryKey[0]], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "editor" } }) }));
vi.mock("@/contexts/TimerContext", () => ({ useTimer: () => ({ sessao: null, start: mocks.start, stop: vi.fn() }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true, isAdmin: true }) }));
vi.mock("@/components/ResumoDoDia", () => ({ ResumoDoDia: () => null }));
vi.mock("@/components/MuralAvisos", () => ({ MuralAvisos: () => null }));
vi.mock("@/components/AvisoPushDesligado", () => ({ AvisoPushDesligado: () => null }));
vi.mock("./Leads", () => ({ TEMPERATURAS: [] }));
vi.mock("@/lib/fluxoEntregavel", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/fluxoEntregavel")>(), aplicarPatch: mocks.patch,
}));

const piece = (status: string, extra = {}) => ({
  id: "piece", codigo: "ADVR-4464", titulo: "Peça com nome completo para conferência",
  status, responsavel_id: "editor", updated_at: "2026-01-01T12:00:00Z",
  project: { id: "project", client_name: "Cliente da peça" }, ...extra,
});
const show = () => render(<MemoryRouter><MinhaMesa /></MemoryRouter>);

beforeEach(() => { mocks.data = {}; vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Minha mesa", () => {
  it("mostra acompanhamento mesmo quando só há uma peça com o cliente", () => {
    mocks.data["minha-mesa-deliverables"] = [piece("com_cliente")];
    show();
    expect(screen.getByRole("heading", { name: "Com o cliente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cliente aprovou" })).toBeInTheDocument();
    expect(screen.queryByText("Tudo em dia")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Seu trabalho" })).not.toBeInTheDocument();
  });

  it("mantém a liberação acessível quando é a única pendência", async () => {
    mocks.data["minha-mesa-deliverables"] = [piece("pendente")];
    show();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar para edição" })); });
    expect(mocks.patch).toHaveBeenCalledWith("piece", expect.objectContaining({ status: "pronto_editar" }));
    expect(screen.queryByText("Tudo em dia")).not.toBeInTheDocument();
  });

  it("mostra a peça aguardando revisão sem pendências próprias", () => {
    mocks.data["minha-mesa-deliverables"] = [piece("revisao_n1")];
    mocks.data["approval-settings"] = { nivel1_user_id: "reviewer" };
    show();
    expect(screen.getByRole("heading", { name: "Vai entrar pra você" })).toBeInTheDocument();
    expect(screen.queryByText("Tudo em dia")).not.toBeInTheDocument();
  });

  it("expande a fila preservando o link da peça e seus atalhos", () => {
    mocks.data["minha-mesa-deliverables"] = [piece("pronto_editar")];
    show();
    fireEvent.click(screen.getByRole("button", { name: /Na fila/ }));
    expect(screen.getByRole("link", { name: "Peça com nome completo para conferência" }))
      .toHaveAttribute("href", "/projetos/project/entregaveis/piece");
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rastrear horas nesta peça" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Na fila/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("mostra o estado vazio somente sem trabalho ou acompanhamento", () => {
    show();
    expect(screen.getByText("Tudo em dia")).toBeInTheDocument();
  });
  it("prioriza prazo interno próximo antes de ajuste bloqueante sem prazo", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T12:00:00"));
    mocks.data["minha-mesa-deliverables"] = [
      piece("ajuste_interno", { id: "ajuste", titulo: "Ajuste sem prazo" }),
      piece("pronto_editar", { id: "depois", titulo: "Depois", data_entrega: "2026-10-20" }),
      piece("pronto_editar", { id: "hoje", titulo: "Primeiro", prazo_interno: "2026-10-15", data_entrega: "2026-10-25" }),
    ];
    show();
    fireEvent.click(screen.getByRole("button", { name: /Na fila/ }));
    const links = screen.getAllByRole("link").filter(l => ["Primeiro", "Depois", "Ajuste sem prazo"].includes(l.textContent || ""));
    expect(links.map(l => l.textContent)).toEqual(["Primeiro", "Depois", "Ajuste sem prazo"]);
    expect(screen.getByText("Hoje")).toBeInTheDocument();
  });

  it("mantém edição acima das tarefas administrativas, mesmo quando estão vencidas", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T12:00:00"));
    mocks.data["minha-mesa-deliverables"] = [piece("pronto_editar", { data_entrega: "2026-10-16" })];
    mocks.data["minha-mesa-tarefas"] = [{ id: "urgente", title: "Tarefa vencida", due_date: "2026-10-14" }];
    show();
    expect(screen.getAllByRole("heading", { level: 3 }).map(h => h.textContent))
      .toEqual(["Pra eu editar", "Outras tarefas"]);
  });

  it("ordena peças para liberação pelo prazo e deixa sem prazo no fim", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T12:00:00"));
    mocks.data["minha-mesa-deliverables"] = [
      piece("pendente", { id: "sem", titulo: "Sem prazo" }),
      piece("pendente", { id: "futuro", titulo: "Próxima semana", data_entrega: "2026-10-20" }),
      piece("pendente", { id: "hoje", titulo: "Liberar hoje", data_entrega: "2026-10-15" }),
    ];
    show();
    expect(screen.getAllByRole("link").map(l => l.textContent)).toEqual(["Liberar hoje", "Próxima semana", "Sem prazo"]);
  });

  it("deixa outras tarefas depois de todas as ações de produção", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T12:00:00"));
    mocks.data["minha-mesa-deliverables"] = [
      piece("pendente", { id: "liberar", titulo: "Liberar material", data_entrega: "2026-10-16" }),
      piece("pronto_editar", { id: "editar", titulo: "Editar sem prazo" }),
      piece("pronto", { id: "enviar", titulo: "Enviar ao cliente", data_entrega: "2026-10-15" }),
    ];
    mocks.data["minha-mesa-tarefas"] = [{ id: "news", title: "News", due_date: "2026-08-01" }];
    show();
    expect(screen.getAllByRole("heading", { level: 3 }).map(h => h.textContent))
      .toEqual(["Pra eu editar", "Pra eu aprovar", "Liberar pra edição", "Outras tarefas"]);
  });

});
