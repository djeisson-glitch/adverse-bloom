import { describe, expect, it } from "vitest";
import { agrupamentoAutomatico, agruparPorStatus } from "./agrupamentoEntregas";
const item=(id:string,titulo="Manifesto",formato="9x16")=>({id,titulo,formato});
describe("Escolha automática do agrupamento",()=>{
 it("não agrupa por cidade quando só quatro de 22 peças têm cidade",()=>{
  const itens=Array.from({length:22},(_,i)=>item(String(i),i<2?"Vídeo - Erebango":i<4?"Vídeo - Ipiranga do Sul":"Manifesto",i===21?"16x9":"9x16"));
  expect(agrupamentoAutomatico(itens)).toBe("formato");
 });
 it("usa cidades apenas com cobertura suficiente e mais de uma cidade",()=>{
  const itens=[item("1","Vídeo - Erebango"),item("2","Reel - Erebango"),item("3","Vídeo - Ipiranga do Sul"),item("4"),item("5")];
  expect(agrupamentoAutomatico(itens)).toBe("cidade");
  expect(agrupamentoAutomatico([...itens,item("6")])).toBe("formato");
  expect(agrupamentoAutomatico(itens.slice(0,2))).toBe("formato");
 });
 it("usa lista simples quando não há informação de agrupamento",()=>{
  expect(agrupamentoAutomatico([])).toBe("nenhum");
  expect(agrupamentoAutomatico([item("1","Manifesto","")])).toBe("nenhum");
 });
 it("reúne revisões antigas em uma etapa e mantém cada peça uma vez",()=>{
  const itens=["revisao_n2","revisao","revisao_n1","entregue","pendente",null].map((status,i)=>({...item(String(i)),status}));
  const grupos=agruparPorStatus(itens);
  expect(grupos.map(g=>g.label)).toEqual(["Pendente","Revisão interna","Entregue","Sem status"]);
  expect(grupos[1].itens).toHaveLength(3);
  expect(grupos.flatMap(g=>g.itens).map(i=>i.id).sort()).toEqual(itens.map(i=>i.id).sort());
 });
});
