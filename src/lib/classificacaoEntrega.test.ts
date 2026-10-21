import { describe, expect, it } from "vitest";
import { classificarEntrega, agruparPorCategoria, correspondeCategoria } from "./classificacaoEntrega";
describe("Classificação visual das entregas",()=>{
 it.each([
  ["PÓS | Filme 16x9","",["16x9"]],
  ["Filme 16 X 9","",["16x9"]],
  ["Filme","16×9",["16x9"]],
  ["REEL_CHAMADA","",["reels"]],
  ["PÓS | Reels Saúde 30s","9:16",["reels"]],
  ["PÓS | Story - SAPANDI","",["story"]],
  ["Stories do evento","9x16",["story"]],
  ["Vídeo YouTube","",["youtube"]],
  ["YouTube Shorts","",["youtube","vertical"]],
  ["Depoimento","9x16",["vertical"]],
  ["Vídeo vertical","",["vertical"]],
  ["Filme principal","16x9 e 9x16",["16x9","vertical"]],
  ["Reels e Story","",["reels","story"]],
  ["YouTube horizontal","",["16x9","youtube"]],
  ["PÓS | Fotos Expodireto SLC","",["fotos"]],
  ["PÓS | Mosaico de fotos","",[]],
  ["Storytelling institucional","",[]],
  ["PÓS | aftermovie","",[]],
  ["Visita técnica","",[]],
  ["","",[]],
 ])("classifica %s / %s sem inventar canal",(titulo,formato,categorias)=>expect(classificarEntrega({titulo,formato})).toEqual({categorias,origem:"automatica"}));
 it("escolha manual prevalece mesmo depois de renomear",()=>expect(classificarEntrega({titulo:"Reel",formato:"16x9",classificacao_visual:["story"]})).toEqual({categorias:["story"],origem:"manual"}));
 it("voltar para automático acompanha nome e formato",()=>expect(classificarEntrega({titulo:"Reel",classificacao_visual:null}).categorias).toEqual(["reels"]));
 it("não duplica entrega nem transforma versões em novas peças",()=>{
  const itens=[{id:1,titulo:"Filme",formato:"16x9 e 9x16"},{id:2,titulo:"Reel"},{id:3,titulo:"Story"},{id:4,titulo:"Genérico"}];
  const grupos=agruparPorCategoria(itens);expect(grupos.flatMap(g=>g.itens)).toHaveLength(4);expect(new Set(grupos.flatMap(g=>g.itens.map(i=>i.id))).size).toBe(4);
  expect(grupos.at(-1)?.chave).toBe("sem_classificacao");
  expect(itens.filter(i=>correspondeCategoria(i,"16x9"))).toEqual([itens[0]]);
  expect(itens.filter(i=>correspondeCategoria(i,"vertical"))).toEqual([itens[0]]);
 });
 it("deduplica escolhas manuais e ignora valores desconhecidos",()=>expect(classificarEntrega({classificacao_visual:["reels","reels","invalid"]}).categorias).toEqual(["reels"]));
 it("filtro desconhecido não esconde entregas",()=>expect(correspondeCategoria({titulo:"Reel"},"invalido")).toBe(true));
});
