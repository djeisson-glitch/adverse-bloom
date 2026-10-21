import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EtiquetasEntrega,FiltrosEntrega } from "./ClassificacaoEntrega";
describe("Categorias visuais",()=>{
 it("mostra múltiplos identificadores com rótulos legíveis",()=>{render(<EtiquetasEntrega item={{titulo:"YouTube",formato:"16x9"}}/>);expect(screen.getByText("16×9")).toBeVisible();expect(screen.getByText("YouTube")).toBeVisible();});
 it("permite filtrar e conta a peça uma vez em Todos",()=>{
  const onChange=vi.fn();render(<FiltrosEntrega itens={[{titulo:"Reels e Story"},{titulo:"Sem sinal"}]} valor="todos" onChange={onChange}/>);
  expect(screen.getByRole("button",{name:"Todos 2"})).toHaveAttribute("aria-pressed","true");
  fireEvent.click(screen.getByRole("button",{name:"Reels 1"}));expect(onChange).toHaveBeenCalledWith("reels");expect(screen.getByRole("button",{name:"A classificar 1"})).toBeVisible();
 });
 it("não inventa identificador em item ambíguo",()=>{render(<EtiquetasEntrega item={{titulo:"Mosaico de fotos"}}/>);expect(screen.getByText("A classificar")).toBeVisible();expect(screen.queryByText("Fotos")).toBeNull();});
});
