import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PastasProjeto } from "./PastasProjeto";
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:mock.rpc}}));
let client: QueryClient;
function show(){
  client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><PastasProjeto projectId="p1"/></QueryClientProvider>);
}
beforeEach(()=>mock.rpc.mockReset());
afterEach(()=>{cleanup();client?.clear();});
it("consulta automaticamente e mostra status sem botão, link ou modal",async()=>{
  mock.rpc.mockResolvedValue({data:{configured:true,online:true,job:null},error:null});show();
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Pastas: aguardando liberação"));
  expect(mock.rpc).toHaveBeenCalledWith("pastas_estado",{_project_id:"p1"});
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("mostra concluído mesmo com NAS offline e mantém caminho no detalhe",async()=>{
  mock.rpc.mockResolvedValue({data:{configured:true,online:false,job:{status:"ready",relative_path:"pasta/existente"}},error:null});show();
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Pastas criadas"));
  expect(screen.getByRole("status")).toHaveAttribute("title","PROJETOS_ATIVOS/pasta/existente");
  expect(screen.getByRole("link",{name:"Abrir pasta no Finder"})).toHaveAttribute("href","adverse-finder://open?path=pasta%2Fexistente");
});
it.each(["pending","working"])("não considera %s offline como concluído ou criando",async status=>{
  mock.rpc.mockResolvedValue({data:{configured:true,online:false,job:{status}},error:null});show();
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Pastas: aguardando servidor"));
});
it("indica processamento ativo",async()=>{
  mock.rpc.mockResolvedValue({data:{configured:true,online:true,job:{status:"working"}},error:null});show();
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Criando pastas…"));
});
it("mostra falha sem oferecer ações manuais",async()=>{
  mock.rpc.mockResolvedValue({data:{configured:true,online:true,job:{status:"error",error:"Pasta em outro mês"}},error:null});show();
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Pastas: erro na criação"));
  expect(screen.getByRole("status")).toHaveAttribute("title","Pasta em outro mês");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("falha na consulta não vira aguardando liberação",async()=>{
  mock.rpc.mockResolvedValue({data:null,error:new Error("offline")});show();
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Pastas: status indisponível"));
});
