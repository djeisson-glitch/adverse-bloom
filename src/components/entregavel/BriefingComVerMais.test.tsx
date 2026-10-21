import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BriefingComVerMais } from "./BriefingComVerMais";
import { useFormAutosave } from "@/hooks/useFormAutosave";
function Harness({inicial="",salvar=vi.fn().mockResolvedValue(undefined)}:{inicial?:string;salvar?:(patch:any)=>Promise<void>}) {
 const [valor,setValor]=useState(inicial);
 const [poll,setPoll]=useState(0);
 const auto=useFormAutosave(salvar);
 return <><span>{auto.status}</span><span>Atualização {poll}</span><button onClick={()=>setPoll(p=>p+1)}>Atualizar</button>
  <BriefingComVerMais valor={valor} onChange={v=>{setValor(v);auto.agendar({descricao:v});}} onConcluir={()=>void auto.gravarAgora()}/></>;
}
afterEach(()=>vi.useRealTimers());
describe("Briefing mantém edição e cursor",()=>{
 it("campo vazio não desmonta ao digitar o primeiro texto",()=>{
  render(<Harness/>);const campo=screen.getByRole("textbox");campo.focus();fireEvent.change(campo,{target:{value:"Primeira orientação"}});
  expect(screen.getByRole("textbox")).toBe(campo);expect(campo).toHaveFocus();expect(campo).toHaveValue("Primeira orientação");
 });
 it("salvar e renderizar novamente mantém foco e seleção no meio do texto",async()=>{
  vi.useFakeTimers();let resolver!:()=>void;const salvar=vi.fn(()=>new Promise<void>(r=>{resolver=r;}));
  render(<Harness inicial="Cena inicial e encerramento" salvar={salvar}/>);
  fireEvent.click(screen.getByRole("button",{name:"Editar briefing e orientações"}));
  const campo=screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.change(campo,{target:{value:"Cena revisada e encerramento"}});campo.setSelectionRange(5,13);fireEvent.select(campo);
  await act(async()=>{await vi.advanceTimersByTimeAsync(800);});expect(salvar).toHaveBeenCalledWith({descricao:"Cena revisada e encerramento"});
  expect(screen.getByText("salvando")).toBeVisible();expect(screen.getByRole("textbox")).toBe(campo);expect(campo).toHaveFocus();expect(campo.selectionStart).toBe(5);expect(campo.selectionEnd).toBe(13);
  await act(async()=>resolver());expect(screen.getByText("salvo")).toBeVisible();expect(campo).toHaveFocus();expect(campo.selectionStart).toBe(5);expect(campo.selectionEnd).toBe(13);
  fireEvent.click(screen.getByRole("button",{name:"Atualizar"}));expect(screen.getByRole("textbox")).toBe(campo);expect(campo.selectionStart).toBe(5);
 });
 it("perder foco não sai da edição",()=>{
  render(<Harness inicial="Orientação"/>);fireEvent.click(screen.getByRole("button",{name:"Editar briefing e orientações"}));const campo=screen.getByRole("textbox");
  fireEvent.blur(campo);expect(screen.getByRole("textbox")).toBe(campo);
 });
 it("concluir e reabrir restaura seleção e rolagem",()=>{
  render(<Harness inicial="Início, meio e final"/>);fireEvent.click(screen.getByRole("button",{name:"Editar briefing e orientações"}));
  const campo=screen.getByRole("textbox") as HTMLTextAreaElement;expect(campo.selectionStart).toBe(campo.value.length);
  campo.setSelectionRange(8,12,"backward");campo.scrollTop=85;fireEvent.select(campo);fireEvent.blur(campo);
  fireEvent.click(screen.getByRole("button",{name:"Concluir edição"}));expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Editar briefing e orientações"}));const novo=screen.getByRole("textbox") as HTMLTextAreaElement;
  expect(novo).toHaveFocus();expect(novo.selectionStart).toBe(8);expect(novo.selectionEnd).toBe(12);expect(novo.selectionDirection).toBe("backward");expect(novo.scrollTop).toBe(85);
 });
 it("erro de salvamento preserva o texto e a edição",async()=>{
  vi.useFakeTimers();render(<Harness salvar={vi.fn().mockRejectedValue(new Error("offline"))}/>);const campo=screen.getByRole("textbox");campo.focus();
  fireEvent.change(campo,{target:{value:"Não perder este texto"}});await act(async()=>{await vi.advanceTimersByTimeAsync(800);});
  expect(screen.getByText("erro")).toBeVisible();expect(screen.getByRole("textbox")).toBe(campo);expect(campo).toHaveValue("Não perder este texto");expect(campo).toHaveFocus();
 });
 it("trocar de entregável reinicia a sessão sem carregar a posição anterior",()=>{
  const {rerender}=render(<BriefingComVerMais key="a" valor="Texto A" onChange={()=>{}}/>);fireEvent.click(screen.getByRole("button",{name:"Editar briefing e orientações"}));
  rerender(<BriefingComVerMais key="b" valor="Texto B" onChange={()=>{}}/>);expect(screen.queryByRole("textbox")).toBeNull();expect(screen.getByText("Texto B")).toBeVisible();
 });
});
