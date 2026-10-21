import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { BlocosEntrega, FiltrosEntrega } from "./ClassificacaoEntrega";
import { correspondeCategoria } from "@/lib/classificacaoEntrega";
const itens=[{id:"1",titulo:"Filme",formato:"16x9"},{id:"2",titulo:"Reels e Story"},{id:"3",titulo:"Sem formato"}];
function Lista(){const [f,setF]=useState("todos");return <><FiltrosEntrega itens={itens} valor={f} onChange={setF}/><BlocosEntrega itens={itens.filter(i=>correspondeCategoria(i,f))} renderItem={i=><div>{i.titulo}</div>}/></>;}
describe("Blocos de entregáveis",()=>{
 it("Todos separa as categorias, sem duplicar peças de vários formatos",()=>{
  render(<Lista/>);
  expect(within(screen.getByRole("region",{name:"16×9"})).getByText("Filme")).toBeVisible();
  expect(within(screen.getByRole("region",{name:"Reels + Story"})).getByText("Reels e Story")).toBeVisible();
  expect(screen.getAllByText("Reels e Story")).toHaveLength(1);
  expect(within(screen.getByRole("region",{name:"A classificar"})).getByText("Sem formato")).toBeVisible();
 });
 it("filtra sem perder os blocos e recupera todos ao limpar o filtro",()=>{
  render(<Lista/>);fireEvent.click(screen.getByRole("button",{name:"Story 1"}));
  expect(screen.queryByText("Filme")).not.toBeInTheDocument();expect(screen.getByText("Reels e Story")).toBeVisible();
  expect(screen.getAllByRole("region")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button",{name:"Todos 3"}));expect(screen.getAllByRole("region")).toHaveLength(3);
 });
 it("não cria blocos vazios",()=>{render(<BlocosEntrega itens={[]} renderItem={()=>null}/>);expect(screen.queryByRole("region")).not.toBeInTheDocument();});
});
