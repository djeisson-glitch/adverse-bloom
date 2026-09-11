import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const m = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (patch: any) => {
        m.update(patch);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));

import { EntregasSection } from "./OrcamentoEditor";

const budget = {
  id: "b1",
  entregas: [
    { titulo: "Filme principal", formato: "16x9", duracao: "60s", quantidade: 1, diarias: 2 },
    { titulo: "Corte Reels", formato: "9x16", duracao: "30s", quantidade: 3, diarias: 0 },
  ],
};

describe("EntregasSection — editar entregas", () => {
  beforeEach(() => { vi.useFakeTimers(); m.update.mockReset(); });
  afterEach(() => vi.useRealTimers());

  const gravado = () => m.update.mock.calls.at(-1)?.[0]?.entregas;

  it("editar título e quantidade grava a lista inteira com a mudança", async () => {
    render(<EntregasSection budget={budget} onChanged={() => {}} />);

    fireEvent.change(screen.getByDisplayValue("Corte Reels"), { target: { value: "Corte para Reels" } });
    fireEvent.change(screen.getByDisplayValue("3"), { target: { value: "4" } });
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(m.update).toHaveBeenCalledTimes(1); // a rajada vira uma gravação só
    expect(gravado()).toEqual([
      budget.entregas[0],
      { titulo: "Corte para Reels", formato: "9x16", duracao: "30s", quantidade: 4, diarias: 0 },
    ]);
  });

  it("quantidade apagada volta pra 1 ao sair do campo", async () => {
    render(<EntregasSection budget={budget} onChanged={() => {}} />);
    const qtd = screen.getByDisplayValue("3");
    fireEvent.change(qtd, { target: { value: "" } });
    fireEvent.blur(qtd);
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(gravado()[1].quantidade).toBe(1);
  });

  it("excluir tira só a linha certa", async () => {
    render(<EntregasSection budget={budget} onChanged={() => {}} />);
    fireEvent.click(screen.getAllByTitle("Excluir entrega")[0]);
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(gravado()).toEqual([budget.entregas[1]]);
    expect(screen.getByDisplayValue("Corte Reels")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Filme principal")).toBeNull();
  });
});
