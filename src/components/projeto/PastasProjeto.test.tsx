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
it("usa a data de criação em São Paulo e nome compatível com o servidor",()=>{show();expect(screen.getByText(/09. Setembro/)).toHaveTextContent(/^PROJETOS_ATIVOS \/ /);expect(screen.getByLabelText("Pasta do cliente no servidor")).toHaveValue("Sicredi Sul Minas");});
it("envia um pedido autenticado com projeto e pasta escolhida",async()=>{show();fireEvent.change(screen.getByLabelText("Pasta do cliente no servidor"),{target:{value:"Sicredi Sul Minas"}});fireEvent.click(screen.getByRole("button",{name:"Criar pastas"}));await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith("pastas_solicitar",{_project_id:"p1",_client_folder:"Sicredi Sul Minas"}));});
it("não permite novo pedido enquanto aguarda o servidor",()=>{mock.state.job={status:"pending"};show();expect(screen.getByRole("status")).toHaveTextContent("Aguardando o servidor");expect(screen.queryByRole("button",{name:"Criar pastas"})).not.toBeInTheDocument();});
it("não considera a fila como criação concluída",()=>{mock.state.job={status:"working"};show();expect(screen.getByRole("status")).toHaveTextContent("Criando pastas");expect(screen.queryByText("Pastas criadas")).not.toBeInTheDocument();});
it("pasta vazia impede criação e não volta ao valor anterior",()=>{show();fireEvent.change(screen.getByLabelText("Pasta do cliente no servidor"),{target:{value:""}});expect(screen.getByRole("button",{name:"Criar pastas"})).toBeDisabled();});
it("mantém o nome de clientes sem alias confirmado",()=>{expect(pastaClienteInicial("Outro cliente")).toBe("Outro cliente");});

it("informa quando falta vincular um cliente ao projeto",()=>{
  render(<PastasProjeto project={{...project,client_id:null}} isAdmin={false}/>);
  fireEvent.click(screen.getByRole("button",{name:"Pastas no servidor"}));
  expect(screen.getByRole("alert")).toHaveTextContent("Vincule um cliente");
  expect(screen.getByRole("button",{name:"Criar pastas"})).toBeDisabled();
});
it("mostra a raiz também no caminho das pastas concluídas",()=>{
  mock.state.job={status:"ready",relative_path:"_. Database 2026/01. Clientes - Projetos/10. Outubro/SLC/[0369]_TESTE"};
  show();expect(screen.getByText(/^PROJETOS_ATIVOS\//)).toHaveTextContent(mock.state.job.relative_path);
});
