import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AprovacaoInterna } from "./NivelAprovacao";

afterEach(cleanup);
const historico = { aprovado_n1_em: "2026-10-15T12:00:00Z", rev_n1_ajuste: false };
describe("aprovação da rodada atual", () => {
  it.each(["revisao_n1", "revisao", "revisao_n2"])("%s mostra Maiara em amarelo apesar do carimbo anterior", (status) => {
    render(<AprovacaoInterna entregavel={{ ...historico, status }} aprovador="Maiara" autor="Outro revisor" />);
    const chip = screen.getByTitle("Aguardando aprovação");
    expect(chip).toHaveClass("text-warning");
    expect(chip).not.toHaveClass("text-success");
    expect(chip).toHaveTextContent("Interna· Maiara");
    expect(screen.queryByText(/Outro revisor/)).not.toBeInTheDocument();
  });
  it("um status de ajuste nunca aparece aprovado, mesmo com flag antiga incorreta", () => {
    render(<AprovacaoInterna entregavel={{ ...historico, status: "ajuste_interno" }} aprovador="Maiara" autor="Maiara" />);
    expect(screen.getByText(/pediu ajuste/).parentElement).toHaveClass("text-warning");
  });
  it("volta a verde somente depois da aprovação desta rodada", () => {
    const { rerender } = render(<AprovacaoInterna entregavel={{ ...historico, status: "revisao_n1" }} aprovador="Maiara" autor="Maiara" />);
    expect(screen.getByTitle("Aguardando aprovação")).toHaveClass("text-warning");
    rerender(<AprovacaoInterna entregavel={{ ...historico, status: "pronto" }} aprovador="Maiara" autor="Maiara" />);
    expect(screen.queryByTitle("Aguardando aprovação")).not.toBeInTheDocument();
    expect(screen.getByText(/Maiara/).parentElement).toHaveClass("text-success");
  });
  it("em edição não exibe como aprovada uma versão anterior", () => {
    render(<AprovacaoInterna entregavel={{ ...historico, status: "em_edicao" }} aprovador="Maiara" autor="Maiara" />);
    expect(screen.getByText("Interna")).not.toHaveClass("text-success");
  });
});
