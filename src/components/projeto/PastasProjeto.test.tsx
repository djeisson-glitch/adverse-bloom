import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PastasProjeto, pastaClienteInicial } from "./PastasProjeto";
const mock=vi.hoisted(()=>({state:{} as any,rpc:vi.fn()}));
vi.mock("@tanstack/react-query",()=>({useQuery:()=>({data:mock.state,isPending:false,error:null}),useQueryClient:()=>({invalidateQueries:vi.fn()})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:mock.rpc}}));
vi.mock("@/components/ui/confirm",()=>({useConfirm:()=>vi.fn()}));
const project={id:"p1",client_id:"c1",client_name:"Sicredi Sul Minas RS/MG",nome_padrao:"[0369]_TESTE",created_at:"2026-10-01T01:00:00Z"};
function show(){render(<PastasProjeto project={project} isAdmin={false}/>);fireEvent.click(screen.getByRole("button",{name:"Pastas no servidor"}));}
beforeEach(()=>{mock.state={configured:true,online:true};mock.rpc.mockReset();mock.rpc.mockResolvedValue({error:null});});
afterEach(cleanup);
it("aguarda liberação sem oferecer criação manual ou editar destino",()=>{
  show();expect(screen.getByRole("status")).toHaveTextContent("Aguardando liberação em Pré-produção ou Pronto pra editar");
  expect(screen.queryByRole("button",{name:"Criar pastas"})).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();expect(mock.rpc).not.toHaveBeenCalled();
});
it("usa a data de criação em São Paulo e o nome compatível com o servidor",()=>{
  show();expect(screen.getByText(/09. Setembro/)).toHaveTextContent(/^PROJETOS_ATIVOS \/ /);
  expect(screen.getByText(/09. Setembro/)).toHaveTextContent("Sicredi Sul Minas");
});
it("permite reprocessar somente um pedido com erro",async()=>{
  mock.state.job={status:"error",error:"Corrija o nome da pasta"};show();
  expect(screen.getByRole("alert")).toHaveTextContent("Corrija o nome");
  fireEvent.click(screen.getByRole("button",{name:"Reprocessar falha"}));
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith("pastas_reprocessar",{_project_id:"p1"}));
});
it.each(["pending","working","ready"])("não oferece reprocessamento para %s",status=>{
  mock.state.job={status,relative_path:"pasta/existente"};show();
  expect(screen.queryByRole("button",{name:"Reprocessar falha"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Criar pastas"})).not.toBeInTheDocument();
});
it("fila offline não é mostrada como concluída",()=>{
  mock.state.online=false;mock.state.job={status:"pending"};show();
  expect(screen.getByRole("status")).toHaveTextContent("Aguardando o servidor");
  expect(screen.queryByText("Pastas criadas")).not.toBeInTheDocument();
});
it("informa o cliente obrigatório antes da liberação",()=>{
  render(<PastasProjeto project={{...project,client_id:null}} isAdmin={false}/>);
  fireEvent.click(screen.getByRole("button",{name:"Pastas no servidor"}));
  expect(screen.getByRole("alert")).toHaveTextContent("Vincule um cliente antes de liberar");
});
it("mostra a raiz e o caminho realmente concluído",()=>{
  mock.state.job={status:"ready",relative_path:"_. Database 2026/01. Clientes - Projetos/10. Outubro/SLC/[0369]_TESTE"};
  show();expect(screen.getByText(/^PROJETOS_ATIVOS\//)).toHaveTextContent(mock.state.job.relative_path);
});
it("mantém o nome de clientes sem alias confirmado",()=>{expect(pastaClienteInicial("Outro cliente")).toBe("Outro cliente");});
