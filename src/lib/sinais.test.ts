import { describe, it, expect } from "vitest";
import { gerarSinais, type SinaisInput } from "./sinais";

const base: SinaisInput = {
  fmtMoeda: (n) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`,
  fmtPct: (n) => `${n.toFixed(1)}%`,
  margemLiquidaPct: 0, margemLiquidaValor: 0, metaMargem: 10,
  faturamentoMes: 200000, faturamentoVsMeta: 100, monthlyTarget: 200000,
  runway: Infinity, burnRate: 10000, saldoConta: 200000,
  aReceberMes: 50000, aReceberMesVencido: 0, aPagarMesAberto: 0, abertoImpostos: 0,
  fixPctReceita: 20, custosFixos: 40000, geracaoCaixa: 0, geracaoMensalValores: [1, 1, 1, 1, 1, 1],
  trailingMargemLiquidaPct: 0, trailingMargemCaixaPct: 0, faltaPraLucro: 0,
  mrr: 0, retiradaSocios: 0, concentracaoTop3: 0,
  entradas30dTotal: 0, entradas30dTop: null, clientes: [], ticketMedio: 0,
};

describe("gerarSinais", () => {
  it("empresa em apuros: críticos de sobrevivência primeiro, oportunidades suprimidas", () => {
    const s = gerarSinais({
      ...base,
      margemLiquidaPct: -10, margemLiquidaValor: -20000,
      faturamentoVsMeta: 50,
      runway: 1.5, burnRate: 22000, saldoConta: 33000,
      aReceberMes: 80000, aReceberMesVencido: 25000,
      aPagarMesAberto: 40000, abertoImpostos: 7000,
      fixPctReceita: 50, custosFixos: 100000,
      geracaoCaixa: -15000, geracaoMensalValores: [-5000, -3000, -8000, 2000, 1000, -4000],
      trailingMargemLiquidaPct: 5, trailingMargemCaixaPct: -10,
      faltaPraLucro: 30000, mrr: 10000, retiradaSocios: 70000, concentracaoTop3: 72,
      entradas30dTotal: 31000, entradas30dTop: { cliente: "X", valor: 18000 },
      clientes: [{ nome: "Agro", proj: 3, fat: 24000, ticket: 8000 }], ticketMedio: 14000,
    });
    expect(s.length).toBe(6);
    expect(s[0].id).toBe("atn_runway");
    expect(s.every((x) => x.tipo === "atencao")).toBe(true);
    expect(s.some((x) => x.id === "opo_geracao")).toBe(false); // suprimida c/ caixa crítico
    const ranks = s.map((x) => x.severidade);
    expect(ranks.filter((r) => r === "critico").length).toBeGreaterThanOrEqual(5);
  });

  it("empresa saudável: só oportunidades, destaques primeiro, sem duplicar tema", () => {
    const s = gerarSinais({
      ...base,
      margemLiquidaPct: 25, margemLiquidaValor: 50000,
      faturamentoVsMeta: 120, saldoConta: 200000,
      geracaoCaixa: 30000, geracaoMensalValores: [10000, 12000, 8000, 15000, 9000, 11000],
      trailingMargemLiquidaPct: 22, trailingMargemCaixaPct: 20,
      faltaPraLucro: -40000, mrr: 60000,
      entradas30dTotal: 40000, entradas30dTop: { cliente: "Y", valor: 20000 },
      clientes: [{ nome: "Premium", proj: 2, fat: 60000, ticket: 30000 }], ticketMedio: 14000,
    });
    expect(s.length).toBeLessThanOrEqual(6);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.tipo === "oportunidade")).toBe(true);
    expect(s[0].severidade).toBe("destaque");
    // dedup por tema: 'resultado-bom' aparece no máx 1x (margem meta vence break-even)
    expect(s.filter((x) => x.tema === "resultado-bom").length).toBeLessThanOrEqual(1);
    expect(s.some((x) => x.id === "opo_margem_meta")).toBe(true);
  });

  it("nada dispara: lista vazia (empty state honesto)", () => {
    const s = gerarSinais({ ...base, metaMargem: null, faturamentoVsMeta: 90 });
    expect(s.length).toBe(0);
  });
});
