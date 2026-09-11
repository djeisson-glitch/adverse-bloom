import { describe, it, expect } from "vitest";
import { resumirPlanilha, linhaEmUso, type LinhaPlanilha } from "./resumoPlanilha";

const cats = [
  { id: "c003", codigo: "003", nome: "PRODUÇÃO", ordem: 30 },
  { id: "c004", codigo: "004", nome: "TRANSPORTE", ordem: 40 },
  { id: "c006", codigo: "006", nome: "ELENCO", ordem: 60 },
  { id: "c007", codigo: "007", nome: "EQUIPE TÉCNICA", ordem: 70 },
  { id: "c011", codigo: "011", nome: "PÓS PRODUÇÃO", ordem: 110 },
];

const l = (categoria_id: string, descricao: string, quantity: number, diaria: number, client_unit_price = 100): LinhaPlanilha =>
  ({ categoria_id, descricao, quantity, diaria, client_unit_price });

describe("linhaEmUso", () => {
  it("linha do modelo padrão (quantidade 0) não conta, mesmo com preço de catálogo", () => {
    expect(linhaEmUso(l("c007", "Gaffer", 0, 1, 900))).toBe(false);
  });
  it("linha sugerida pela IA (sem preço ainda) conta", () => {
    expect(linhaEmUso(l("c007", "Diretor(a)", 1, 3, 0))).toBe(true);
  });
  it("diária 0 explícita não conta", () => {
    expect(linhaEmUso(l("c004", "Van", 1, 0))).toBe(false);
  });
});

describe("resumirPlanilha", () => {
  const itens = [
    l("c007", "Diretor(a)", 1, 3),
    l("c007", "Operador(a) de Câmera", 2, 3),
    l("c007", "Gaffer", 0, 1, 900),          // modelo, não usado
    l("c006", "Ator/Atriz Principal", 2, 1),
    l("c006", "Agenciamento (20%)", 1, 1),   // taxa, não é gente
    l("c003", "Aluguel Locação", 1, 2),      // produção não é gente
    l("c004", "Van de Produção", 1, 4, 0),   // sem preço ainda
    l("c011", "Edição", 1, 40),
    l("c011", "Color", 1, 8),
    l("c011", "Acessibilidade (Libras)", 1, 1), // serviço fechado
  ];

  const r = resumirPlanilha(itens, cats, [{ quantidade: 3 }, { quantidade: 2 }]);

  it("pessoas = equipe técnica + elenco, sem produção e sem taxa de agenciamento", () => {
    expect(r.pessoas).toBe(5); // 1 diretor + 2 câmeras + 2 atores
  });

  it("diárias = maior número entre as funções, não a soma", () => {
    expect(r.diarias).toBe(3);
  });

  it("horas de pós só somam linhas por hora; serviço fechado fica à parte", () => {
    expect(r.horasPos).toBe(48);
    expect(r.posFechados.map((f) => f.nome)).toEqual(["Acessibilidade (Libras)"]);
  });

  it("entregas = soma das quantidades", () => {
    expect(r.entregas).toBe(5);
  });

  it("outros custos: produção, transporte e a taxa do elenco, na ordem dos grupos", () => {
    expect(r.outros.map((g) => [g.categoria.codigo, g.itens.map((f) => f.nome)])).toEqual([
      ["003", ["Aluguel Locação"]],
      ["004", ["Van de Produção"]],
      ["006", ["Agenciamento (20%)"]],
    ]);
  });

  it("conta as linhas em uso ainda sem preço", () => {
    expect(r.semValor).toBe(1);
  });

  it("grupo oculto sai do resumo, igual sai do total", () => {
    const semEquipe = resumirPlanilha(itens, cats, [], new Set(["c007"]));
    expect(semEquipe.pessoas).toBe(2);
    expect(semEquipe.diarias).toBe(1);
  });

  it("planilha só com modelo padrão: tudo zero", () => {
    const vazio = resumirPlanilha([l("c007", "Gaffer", 0, 1, 900)], cats, []);
    expect(vazio).toMatchObject({ pessoas: 0, diarias: 0, horasPos: 0, entregas: 0, linhasEmUso: 0, outros: [] });
  });
});
