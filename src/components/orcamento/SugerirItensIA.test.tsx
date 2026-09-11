import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const m = vi.hoisted(() => ({
  invoke: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  entregasNoBanco: [] as any[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: any[]) => m.invoke(...a) },
    from: (tabela: string) => {
      if (tabela === "budget_items") {
        return { insert: (linhas: any) => { m.insert(linhas); return Promise.resolve({ error: null }); } };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { entregas: m.entregasNoBanco }, error: null }) }) }),
        update: (patch: any) => {
          m.update(patch);
          return { eq: () => ({ select: () => Promise.resolve({ data: [{ id: "b1" }], error: null }) }) };
        },
      };
    },
  },
}));

import { SugerirItensIA } from "./SugerirItensIA";

const cats = [{ id: "c007", codigo: "007", nome: "EQUIPE TÉCNICA", ordem: 70 }];

describe("SugerirItensIA — entregas", () => {
  beforeEach(() => {
    m.invoke.mockReset(); m.insert.mockReset(); m.update.mockReset();
    // O banco tem uma entrega que a tela ainda nem mostrou (gravada agora há pouco).
    m.entregasNoBanco = [
      { titulo: "Filme principal", formato: "16x9", duracao: "60s", quantidade: 1, diarias: 2 },
      { titulo: "Teaser", formato: "16x9", duracao: "15s", quantidade: 1, diarias: 0 },
    ];
    m.invoke.mockResolvedValue({
      data: {
        itens: [{ categoria_codigo: "007", descricao: "Diretor(a)", quantity: 1, diaria: 2, justificativa: "2 dias de set" }],
        entregas: [
          { titulo: "Filme Principal", formato: "16x9", duracao: "60s", quantidade: 1 },
          { titulo: "Corte para Reels", formato: "9x16", duracao: "30s", quantidade: 3 },
        ],
      },
      error: null,
    });
  });

  it("sugere as entregas, desmarca a repetida e grava somando à lista do banco", async () => {
    const onEntregasInseridas = vi.fn().mockResolvedValue(undefined);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SugerirItensIA
          budgetId="b1"
          categorias={cats}
          itens={[]}
          entregasAtuais={[{ titulo: "Filme principal" }]}
          onChanged={() => {}}
          onEntregasInseridas={onEntregasInseridas}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText(/Descreva o job/), { target: { value: "1 filme de 60s e 3 cortes" } });
    fireEvent.click(screen.getByRole("button", { name: /Sugerir itens/ }));

    expect(await screen.findByText("já existe")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Filme Principal").previousElementSibling).not.toBeChecked();
    expect(screen.getByDisplayValue("Corte para Reels").previousElementSibling).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Adicionar 1 entrega e 1 item" }));
    await waitFor(() => expect(onEntregasInseridas).toHaveBeenCalledTimes(1));

    expect(m.update).toHaveBeenCalledWith({
      entregas: [
        ...m.entregasNoBanco,
        { titulo: "Corte para Reels", formato: "9x16", duracao: "30s", quantidade: 3, diarias: 0 },
      ],
    });
    const [linhas] = m.insert.mock.calls[0];
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ descricao: "Diretor(a)", quantity: 1, diaria: 2, client_unit_price: 0, client_price: 0 });
  });

  it("sem nada marcado, não grava nada", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SugerirItensIA budgetId="b1" categorias={cats} itens={[]} entregasAtuais={[]}
                        onChanged={() => {}} onEntregasInseridas={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Sugerir itens/ }));
    await screen.findByDisplayValue("Corte para Reels");
    screen.getAllByRole("checkbox").forEach((c) => { if ((c as HTMLInputElement).checked) fireEvent.click(c); });
    expect(screen.getByRole("button", { name: "Nada marcado" })).toBeDisabled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
});
