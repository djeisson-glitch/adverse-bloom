import {describe,it,expect} from "vitest";
import {render,screen,within} from "@testing-library/react";
import {BlocosPorCidade} from "./ClassificacaoEntrega";
describe("Cidade → tipos de entregáveis",()=>{
 it("reúne os formatos em cada cidade sem filtros no topo",()=>{
  render(<BlocosPorCidade itens={[{id:"1",titulo:"Reels - Sarandi"},{id:"2",titulo:"Story - Sarandi"},{id:"3",titulo:"Filme - Chapecó",formato:"16x9"}]} renderItem={i=><div>{i.titulo}</div>}/>);
  const sarandi=within(screen.getByRole("region",{name:"Cidade: Sarandi"}));
  expect(sarandi.getByRole("region",{name:"Reels"})).toBeVisible();expect(sarandi.getByRole("region",{name:"Story"})).toBeVisible();
  expect(sarandi.queryByText("Filme - Chapecó")).not.toBeInTheDocument();expect(screen.getAllByText("Reels - Sarandi")).toHaveLength(1);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
 });
 it("se não há cidades identificadas, usa apenas blocos de formato",()=>{
  render(<BlocosPorCidade itens={[{id:"1",titulo:"Filme",formato:"16x9"}]} renderItem={i=><div>{i.titulo}</div>}/>);
  expect(screen.getByRole("region",{name:"16×9"})).toBeVisible();expect(screen.queryByText("Sem cidade identificada")).not.toBeInTheDocument();
 });
 it("mantém as peças sem cidade em um bloco separado quando há cidades",()=>{
  render(<BlocosPorCidade itens={[{id:"1",titulo:"Reels - Sarandi"},{id:"2",titulo:"Abertura geral"}]} renderItem={i=><div>{i.titulo}</div>}/>);
  expect(within(screen.getByRole("region",{name:"Cidade: Sem cidade identificada"})).getByText("Abertura geral")).toBeVisible();
 });
});
