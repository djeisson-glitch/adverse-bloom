import { beforeEach,describe,expect,it,vi } from "vitest";
import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
const m=vi.hoisted(()=>({update:vi.fn(),eq:vi.fn(),single:vi.fn(),error:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>({update:(v:unknown)=>{m.update(v);return{eq:(...args:unknown[])=>{m.eq(...args);return{select:()=>({single:m.single})};}};}})}}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:m.error}}));
import { EditarClassificacaoEntrega } from "./EditarClassificacaoEntrega";
function setup(manual?:string[]){const qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});render(<QueryClientProvider client={qc}><EditarClassificacaoEntrega item={{id:"d1",titulo:"Reels do evento",classificacao_visual:manual}}/></QueryClientProvider>);fireEvent.click(screen.getByRole("button",{name:"Classificar"}));}
beforeEach(()=>{vi.clearAllMocks();m.single.mockResolvedValue({data:{id:"d1"},error:null});});
describe("Ajuste manual de categoria",()=>{
 it("salva apenas a classificação na entrega correta",async()=>{setup();fireEvent.click(screen.getByRole("button",{name:"Story"}));fireEvent.click(screen.getByRole("button",{name:"YouTube"}));fireEvent.click(screen.getByRole("button",{name:"Salvar"}));await waitFor(()=>expect(m.update).toHaveBeenCalledWith({classificacao_visual:["story","youtube"]}));expect(m.eq).toHaveBeenCalledWith("id","d1");});
 it("fixa manualmente a categoria detectada com um clique",async()=>{setup();fireEvent.click(screen.getByRole("button",{name:"Reels"}));fireEvent.click(screen.getByRole("button",{name:"Salvar"}));await waitFor(()=>expect(m.update).toHaveBeenCalledWith({classificacao_visual:["reels"]}));});
 it("retorna ao automático sem mudar nome ou formato",async()=>{setup(["story"]);fireEvent.click(screen.getByRole("button",{name:"Automático pelo nome e formato"}));fireEvent.click(screen.getByRole("button",{name:"Salvar"}));await waitFor(()=>expect(m.update).toHaveBeenCalledWith({classificacao_visual:null}));});
 it("cancelar não grava",()=>{setup();fireEvent.click(screen.getByRole("button",{name:"Story"}));fireEvent.click(screen.getByRole("button",{name:"Cancelar"}));expect(m.update).not.toHaveBeenCalled();});
 it("não informa sucesso quando a gravação falha",async()=>{m.single.mockResolvedValue({data:null,error:new Error("Sem permissão")});setup();fireEvent.click(screen.getByRole("button",{name:"Salvar"}));await waitFor(()=>expect(m.error).toHaveBeenCalled());expect(screen.getByRole("button",{name:"Salvar"})).toBeVisible();});
});
