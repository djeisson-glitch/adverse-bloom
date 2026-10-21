import {describe,it,expect} from "vitest";
import {cidadeDaEntrega,agruparPorCidade} from "./cidadeEntrega";
describe("Cidade pelo nome da entrega",()=>{
 it.each([
  ["PÓS | Endo de Abertura da Live de Lançamento - SARANDI","Sarandi"],
  ["PÓS | Reel Black November - CHAPECÓ","Chapecó"],
  ["PÓS | Edição Reel Black November - PARÁ DE MINAS","Pará de Minas"],
  ["PÓS | Story Feirão de Veículos 01 - CHAPECO","Chapecó"],
  ["PÓS | Story 01 — para de minas","Pará de Minas"],
  ["PÓS | Sarandi | Reel","Sarandi"],
  ["Reels - Não-Me-Toque/RS","Não-Me-Toque"],
  ["Reels - Sarandi (RS)","Sarandi"],
  ["Reels - Sarandi - RS","Sarandi"],
 ])("reconhece %s",(titulo,nome)=>expect(cidadeDaEntrega({titulo})?.nome).toBe(nome));
 it.each(["Campanha de Natal","Vídeo de Feliz aniversário","Story - Cliente X","Reels - Chapecó/MG","Reels - Chapecó - Sarandi",""])("não supõe cidade em %s",titulo=>expect(cidadeDaEntrega({titulo})).toBeNull());
 it("agrupa variações de caixa e acento sem duplicar nem alterar os objetos",()=>{
  const itens=[{id:1,titulo:"Reels - CHAPECÓ"},{id:2,titulo:"Story - chapeco"},{id:3,titulo:"Vídeo geral"}];
  const antes=JSON.stringify(itens);const grupos=agruparPorCidade(itens);
  expect(grupos.map(g=>g.label)).toEqual(["Chapecó","Sem cidade identificada"]);
  expect(grupos[0].itens).toEqual(itens.slice(0,2));expect(grupos.flatMap(g=>g.itens)).toHaveLength(3);expect(JSON.stringify(itens)).toBe(antes);
 });
 it("separa municípios homônimos quando há UFs diferentes",()=>{
  const grupos=agruparPorCidade([{titulo:"Reels - Sarandi/RS"},{titulo:"Story - Sarandi/PR"},{titulo:"Vídeo - Sarandi"}]);
  expect(grupos).toHaveLength(3);expect(grupos.map(g=>g.label)).toContain("Sarandi · UF não informada");
 });
 it("reúne nome com e sem UF quando não há conflito",()=>expect(agruparPorCidade([{titulo:"Reels - Chapecó/SC"},{titulo:"Story - Chapecó"}])).toHaveLength(1));
});
