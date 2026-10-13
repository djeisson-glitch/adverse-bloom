import { describe, it, expect } from "vitest";
import { diariasDaCarta, edicaoCartaSimples } from "./cartaSimples";
const categorias = [{id: "equipe", codigo: "007", nome: "Equipe", ordem: 1}, {id: "pos", codigo: "011", nome: "Pós", ordem: 2}];
const itens = [{categoria_id: "equipe", descricao: "Câmera", quantity: 2, diaria: 1}, {categoria_id: "equipe", descricao: "Assistente", quantity: 1, diaria: 1}, {categoria_id: "pos", descricao: "Edição", quantity: 1, diaria: 15}];
describe("diárias e textos da carta simples", () => {
  it("não soma pessoas nem horas de edição como dias de set", () => expect(diariasDaCarta({}, itens, categorias)).toBe(1));
  it("usa o escopo contratado e preserva meia diária", () => expect(diariasDaCarta({entregas: [{diarias: 0.5}]}, itens, categorias)).toBe(0.5));
  it("usa capture_days quando o escopo não informa diárias", () => expect(diariasDaCarta({capture_days: 3}, itens, categorias)).toBe(3));
  it("ignora categorias ocultas e não inventa diárias em pós pura", () => expect(diariasDaCarta({categorias_ocultas: ["equipe"]}, itens, categorias)).toBe(0));
  it("restaura textos vazios intencionais, listas vazias e chaves desligadas", () => {
    const draft = edicaoCartaSimples();
    draft.textos.ac = ""; draft.textos.incl = []; draft.ver.itens = false;
    expect(edicaoCartaSimples(draft)).toEqual(draft);
  });
});
