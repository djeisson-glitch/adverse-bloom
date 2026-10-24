import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EntregaveisAgrupados } from "./EntregaveisAgrupados";
const itens=[{id:"1",titulo:"Vídeo - Erebango",formato:"16x9",status:"pendente"},{id:"2",titulo:"Vídeo - Sarandi",formato:"9x16",status:"em_edicao"},{id:"3",titulo:"Manifesto",formato:"9x16",status:"em_edicao"},{id:"4",titulo:"Institucional",formato:"16x9",status:"entregue"}];
const renderItem=(i:typeof itens[number])=><div data-testid="entrega">{i.titulo}</div>;
const lista=(projectId="a")=><EntregaveisAgrupados projectId={projectId} itens={itens} renderItem={renderItem}/>;
const seletor=()=>screen.getByRole("combobox",{name:"Agrupar por"});
beforeEach(()=>localStorage.clear());
describe("Modos de agrupamento do projeto",()=>{
 it("troca todos os modos sem perder nem duplicar entregas",()=>{
  render(lista());
  expect(screen.getByRole("option",{name:"Automático · Formato"})).toBeVisible();
  for(const modo of ["cidade","formato","status","nenhum","automatico"]){
   fireEvent.change(seletor(),{target:{value:modo}});
   expect(screen.getByRole("option",{name:"Automático · Formato"})).toBeVisible();
   expect(screen.getAllByTestId("entrega").map(el=>el.textContent).sort()).toEqual(itens.map(i=>i.titulo).sort());
  }
 });
 it("mantém escolhas independentes ao navegar entre projetos e reabrir a página",()=>{
  const view=render(lista("a"));
  fireEvent.change(seletor(),{target:{value:"status"}});
  expect(screen.getByRole("region",{name:"Status: Em edição"})).toBeVisible();
  view.rerender(lista("b"));expect(seletor()).toHaveValue("automatico");
  fireEvent.change(seletor(),{target:{value:"nenhum"}});
  view.rerender(lista("a"));expect(seletor()).toHaveValue("status");
  view.unmount();render(lista("b"));expect(seletor()).toHaveValue("nenhum");
 });
 it("ignora preferências inválidas",()=>{
  localStorage.setItem("adverse:entregaveis:agrupamento:a","inexistente");render(lista());expect(seletor()).toHaveValue("automatico");
 });
 it("preserva expansão independente das cidades",()=>{
  render(lista());fireEvent.change(seletor(),{target:{value:"cidade"}});
  const erebango=screen.getByRole("button",{name:/Erebango/});
  const sarandi=screen.getByRole("button",{name:/Sarandi/});
  expect(erebango).toHaveAttribute("aria-expanded","false");
  fireEvent.click(erebango);expect(erebango).toHaveAttribute("aria-expanded","true");expect(sarandi).toHaveAttribute("aria-expanded","false");
 });
});
