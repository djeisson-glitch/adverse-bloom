import {describe,it,expect} from "vitest";
import {render,screen,within,fireEvent} from "@testing-library/react";
import {BlocosPorCidade} from "./ClassificacaoEntrega";
describe("Cidade → tipos de entregáveis",()=>{
 it("reúne os formatos em cada cidade sem filtros no topo",()=>{
  render(<BlocosPorCidade itens={[{id:"1",titulo:"Reels - Sarandi"},{id:"2",titulo:"Story - Sarandi"},{id:"3",titulo:"Filme - Chapecó",formato:"16x9"}]} renderItem={i=><div>{i.titulo}</div>}/>);
  fireEvent.click(screen.getByRole("button",{name:"Sarandi 2 entregas"}));
  const sarandi=within(screen.getByRole("region",{name:"Cidade: Sarandi"}));
  expect(sarandi.getByRole("region",{name:"Reels"})).toBeVisible();expect(sarandi.getByRole("region",{name:"Story"})).toBeVisible();
  expect(sarandi.queryByText("Filme - Chapecó")).not.toBeInTheDocument();expect(screen.getAllByText("Reels - Sarandi")).toHaveLength(1);
  expect(screen.queryByLabelText("Filtrar entregas por categoria")).not.toBeInTheDocument();
 });
 it("se não há cidades identificadas, usa apenas blocos de formato",()=>{
  render(<BlocosPorCidade itens={[{id:"1",titulo:"Filme",formato:"16x9"}]} renderItem={i=><div>{i.titulo}</div>}/>);
  expect(screen.getByRole("region",{name:"16×9"})).toBeVisible();expect(screen.queryByText("Sem cidade identificada")).not.toBeInTheDocument();
 });
 it("mantém as peças sem cidade em um bloco separado quando há cidades",()=>{
  render(<BlocosPorCidade itens={[{id:"1",titulo:"Reels - Sarandi"},{id:"2",titulo:"Abertura geral"}]} renderItem={i=><div>{i.titulo}</div>}/>);
  fireEvent.click(screen.getByRole("button",{name:"Sem cidade identificada 1 entrega"}));
  expect(within(screen.getByRole("region",{name:"Cidade: Sem cidade identificada"})).getByText("Abertura geral")).toBeVisible();
 });
 it("inicia recolhido e expande cada cidade de forma independente",()=>{
  render(<BlocosPorCidade itens={[{id:"1",titulo:"Reels - Sarandi"},{id:"2",titulo:"Story - Chapecó"}]} renderItem={i=><div>{i.titulo}</div>}/>);
  const sarandi=screen.getByRole("button",{name:"Sarandi 1 entrega"});
  const chapeco=screen.getByRole("button",{name:"Chapecó 1 entrega"});
  expect(sarandi).toHaveAttribute("aria-expanded","false");expect(screen.getByText("Reels - Sarandi")).not.toBeVisible();
  fireEvent.click(sarandi);expect(sarandi).toHaveAttribute("aria-expanded","true");expect(screen.getByText("Reels - Sarandi")).toBeVisible();
  expect(chapeco).toHaveAttribute("aria-expanded","false");expect(screen.getByText("Story - Chapecó")).not.toBeVisible();
  fireEvent.click(chapeco);expect(screen.getByText("Story - Chapecó")).toBeVisible();
  fireEvent.click(sarandi);expect(screen.getByText("Reels - Sarandi")).not.toBeVisible();expect(screen.getByText("Story - Chapecó")).toBeVisible();
 });
 it("preserva cidades abertas quando a lista é atualizada",()=>{
  const itens=[{id:"1",titulo:"Reels - Sarandi"}];const renderItem=(i:typeof itens[number])=><div>{i.titulo}</div>;
  const {rerender}=render(<BlocosPorCidade itens={itens} renderItem={renderItem}/>);
  fireEvent.click(screen.getByRole("button",{name:"Sarandi 1 entrega"}));
  rerender(<BlocosPorCidade itens={[...itens,{id:"2",titulo:"Story - Sarandi"}]} renderItem={renderItem}/>);
  expect(screen.getByRole("button",{name:"Sarandi 2 entregas"})).toHaveAttribute("aria-expanded","true");expect(screen.getByText("Story - Sarandi")).toBeVisible();
 });

});
