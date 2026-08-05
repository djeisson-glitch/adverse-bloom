import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useFiltro } from "./useFiltro";

/**
 * O que estes testes protegem: o filtro tem que sobreviver a sair da tela e
 * voltar. É um comportamento que só falha na segunda visita — o tipo de coisa
 * que passa despercebida abrindo a página uma vez e olhando.
 */

function wrapper(rota = "/entregas") {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[rota]}>{children}</MemoryRouter>
  );
}

beforeEach(() => sessionStorage.clear());

describe("useFiltro", () => {
  it("começa no padrão quando não há nada salvo", () => {
    const { result } = renderHook(() => useFiltro("mes", "2026-07", "t"), { wrapper: wrapper() });
    expect(result.current[0]).toBe("2026-07");
  });

  it("a URL manda sobre o padrão — link compartilhado abre filtrado", () => {
    const { result } = renderHook(() => useFiltro("mes", "2026-07", "t"), {
      wrapper: wrapper("/entregas?mes=2026-05"),
    });
    expect(result.current[0]).toBe("2026-05");
  });

  it("lembra o último valor quando a tela é aberta de novo sem query", () => {
    const primeira = renderHook(() => useFiltro("cliente", "todos", "t"), { wrapper: wrapper() });
    act(() => primeira.result.current[1]("unimed"));
    primeira.unmount();

    // Volta pela navegação lateral: URL limpa, mas o trabalho continua o mesmo.
    const segunda = renderHook(() => useFiltro("cliente", "todos", "t"), { wrapper: wrapper() });
    expect(segunda.result.current[0]).toBe("unimed");
  });

  it("escreve o filtro na URL, pra copiar o endereço levar o filtro junto", () => {
    const { result } = renderHook(
      () => ({ filtro: useFiltro("mes", "2026-07", "t"), loc: useLocation() }),
      { wrapper: wrapper() },
    );
    act(() => result.current.filtro[1]("2026-03"));
    expect(result.current.loc.search).toContain("mes=2026-03");
  });

  it("tira da URL quando volta ao padrão — endereço não junta lixo", () => {
    const { result } = renderHook(
      () => ({ filtro: useFiltro("mes", "2026-07", "t"), loc: useLocation() }),
      { wrapper: wrapper("/entregas?mes=2026-03") },
    );
    act(() => result.current.filtro[1]("2026-07"));
    expect(result.current.loc.search).not.toContain("mes=");
  });

  it("aceita updater, como o useState — `setMes(m => proximo(m))` não quebra", () => {
    const { result } = renderHook(() => useFiltro("mes", "2026-07", "t"), { wrapper: wrapper() });
    act(() => result.current[1]((anterior) => (anterior === "2026-07" ? "2026-08" : "erro")));
    expect(result.current[0]).toBe("2026-08");
  });

  it("escopos diferentes não se misturam", () => {
    const a = renderHook(() => useFiltro("cliente", "todos", "entregas"), { wrapper: wrapper() });
    act(() => a.result.current[1]("unimed"));
    a.unmount();

    const b = renderHook(() => useFiltro("cliente", "todos", "faturamento"), { wrapper: wrapper() });
    expect(b.result.current[0]).toBe("todos");
  });
});
