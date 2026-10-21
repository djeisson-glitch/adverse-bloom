import { describe, expect, it } from "vitest";
import { decomporPrecoFinal, fatorLiquidoTabela } from "./precosFinais";
const taxas = { margem: 37.68, imposto: 12, bv: 0, comissoes: [{ nome: "Djêisson", tipo: "%" as const, valor: 4 }] };
describe("preços finais da tabela do cliente", () => {
  it("decompõe a Pílula sem aumentar ou arredondar o preço para R$ 450", () => {
    expect(decomporPrecoFinal(446.60,446.60,taxas)).toEqual({total:446.60,base:206.87,margem:168.28,imposto:53.59,comissao:17.86,bv:0});
  });
  it.each([446.60,761.25,1268.75,497.35,1928.50])("fecha todas as parcelas do serviço de R$ %s", preco => {
    const d=decomporPrecoFinal(preco,preco,taxas);
    expect(d.base+d.margem+d.imposto+d.comissao+d.bv).toBeCloseTo(preco,8);
    expect(d.total).toBe(preco);
  });
  it("mantém o total ao editar taxas e trata comissão fixa e BV por dentro", () => {
    const t={...taxas,margem:20,bv:5,comissoes:[{nome:"A",tipo:"R$" as const,valor:50}]};
    expect(decomporPrecoFinal(1000,1000,t)).toEqual({total:1000,margem:200,imposto:120,bv:50,comissao:50,base:580});
    expect(fatorLiquidoTabela(1000,t)).toBeCloseTo(.78);
  });
  it("itens fora da taxa não reservam margem, sem mudar o preço", () => {
    expect(decomporPrecoFinal(1000,0,taxas).base).toBe(840);
  });
  it("não mascara percentuais que consomem mais que o total", () => {
    expect(decomporPrecoFinal(100,100,{...taxas,margem:90}).base).toBe(-6);
  });
  it("mantém quantidades e preço editado sem reinserir a tabela", () => {
    expect(decomporPrecoFinal(3*500,3*500,taxas).total).toBe(1500);
    expect(fatorLiquidoTabela(0,taxas)).toBeCloseTo(.84);
  });
});
