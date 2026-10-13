import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
const m = vi.hoisted(() => ({ salvar: vi.fn() }));
vi.mock("@/lib/salvarProposta", () => ({ salvarPropostaCampos: m.salvar }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { useEdicaoCartaSimples } from "./useEdicaoCartaSimples";
const wrapper = ({ children }: {children: ReactNode}) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
beforeEach(() => { m.salvar.mockReset().mockImplementation(async (_id, patch) => patch); });

describe("salvamento da carta simples", () => {
  it("salva automaticamente e reabre os textos e as escolhas da mesma opção", async () => {
    const hook = renderHook(() => useEdicaoCartaSimples("opcao-a"), { wrapper });
    act(() => hook.result.current.alterar({ textos: { ...hook.result.current.edicao.textos, ac: "Maria", condicoes: "30 dias", incl: [], entregas: ["Filme 60s"] }, detalhada: true }));
    await waitFor(() => expect(m.salvar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hook.result.current.status).toBe("salvo"));
    const saved = m.salvar.mock.calls[0][1].carta_simples;
    expect(m.salvar.mock.calls[0][0]).toBe("opcao-a");
    hook.unmount();
    const reopen = renderHook(() => useEdicaoCartaSimples("opcao-a", saved), { wrapper });
    expect(reopen.result.current.edicao.textos).toMatchObject({ ac: "Maria", condicoes: "30 dias", incl: [], entregas: ["Filme 60s"] });
    expect(reopen.result.current.edicao.detalhada).toBe(true);
    const other = renderHook(() => useEdicaoCartaSimples("opcao-b"), { wrapper });
    expect(other.result.current.edicao.textos.ac).toBeNull();
  });
  it("espera a última digitação quando já existe uma gravação em andamento", async () => {
    let resolve!: (value: any) => void;
    m.salvar.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const hook = renderHook(() => useEdicaoCartaSimples("a"), { wrapper });
    act(() => hook.result.current.alterar({ textos: { ...hook.result.current.edicao.textos, ac: "Maria" } }));
    let flush!: Promise<boolean>;
    act(() => { flush = hook.result.current.salvar(); });
    act(() => hook.result.current.alterar({ textos: { ...hook.result.current.edicao.textos, ac: "Maria Silva" } }));
    let exportFlush!: Promise<boolean>;
    act(() => { exportFlush = hook.result.current.salvar(); });
    expect(exportFlush).toBe(flush);
    await act(async () => { resolve({}); expect(await exportFlush).toBe(true); });
    expect(m.salvar).toHaveBeenCalledTimes(2);
    expect(m.salvar.mock.calls[1][1].carta_simples.textos.ac).toBe("Maria Silva");
  });
  it("bloqueia a exportação se não salvou e mantém a edição para tentar novamente", async () => {
    m.salvar.mockRejectedValueOnce(new Error("Sem conexão"));
    const hook = renderHook(() => useEdicaoCartaSimples("a"), { wrapper });
    act(() => hook.result.current.alterar({ textos: { ...hook.result.current.edicao.textos, ac: "" } }));
    await act(async () => { expect(await hook.result.current.salvar()).toBe(false); });
    expect(hook.result.current.status).toBe("erro");
    expect(hook.result.current.edicao.textos.ac).toBe("");
    await act(async () => { expect(await hook.result.current.salvar()).toBe(true); });
    expect(hook.result.current.status).toBe("salvo");
  });
});
