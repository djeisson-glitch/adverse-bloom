import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuadroResumo } from "./QuadroResumo";

const cats = [
  { id: "c003", codigo: "003", nome: "PRODUÇÃO", ordem: 30 },
  { id: "c007", codigo: "007", nome: "EQUIPE TÉCNICA", ordem: 70 },
  { id: "c011", codigo: "011", nome: "PÓS PRODUÇÃO", ordem: 110 },
];
const l = (categoria_id: string, descricao: string, quantity: number, diaria: number, client_unit_price = 100) =>
  ({ categoria_id, descricao, quantity, diaria, client_unit_price });

describe("QuadroResumo", () => {
  it("mostra os números e o que o job usa, sem abrir grupo", () => {
    render(
      <QuadroResumo
        itens={[
          l("c007", "Diretor(a)", 1, 2.5),
          l("c007", "Operador(a) de Câmera", 2, 2),
          l("c003", "Aluguel Locação", 1, 2, 0),
          l("c011", "Edição", 1, 40),
        ]}
        categorias={cats}
        entregas={[{ quantidade: 3 }]}
        ocultas={new Set()}
      />,
    );
    expect(screen.getByText("2,5")).toBeInTheDocument();          // diárias (maior, formato BR)
    expect(screen.getAllByText("40h")).toHaveLength(2);           // total de pós + a linha "Edição"
    expect(screen.getByText("Operador(a) de Câmera")).toBeInTheDocument();
    expect(screen.getByText("Aluguel Locação")).toBeInTheDocument();
    expect(screen.getByText("produção")).toBeInTheDocument();     // grupo dos outros custos
    expect(screen.getByText("1 sem valor")).toBeInTheDocument();
  });

  it("não aparece com a planilha só no modelo padrão", () => {
    const { container } = render(
      <QuadroResumo itens={[l("c007", "Gaffer", 0, 1, 900)]} categorias={cats} entregas={[]} ocultas={new Set()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("corta a coluna em 6 linhas e o +N mostra o resto", () => {
    const muitos = Array.from({ length: 11 }, (_, i) => l("c003", `Item ${i + 1}`, 1, 1));
    render(<QuadroResumo itens={muitos} categorias={cats} entregas={[]} ocultas={new Set()} />);
    expect(screen.getByText("Item 5")).toBeInTheDocument();   // 1 cabeçalho de grupo + 5 itens
    expect(screen.queryByText("Item 6")).toBeNull();
    fireEvent.click(screen.getByText("+6"));
    expect(screen.getByText("Item 11")).toBeInTheDocument();
  });
});
