import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const m=vi.hoisted(()=>({rpc:vi.fn(),cfg:true,error:vi.fn()}));
const taxas={bv:0,margem:37.68,imposto:12,comissoes:[{nome:"Djêisson",tipo:"%",valor:4}]};
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:m.rpc,from:(table:string)=>{
 const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:m.cfg?{orcamento_taxas_inclusas:taxas}:null,error:null}),
 order:async()=>({data:[{id:"p",tipo:"Pílula",preco:446.6,e_diaria:false},{id:"d",tipo:"Captação",preco:1928.5,e_diaria:true}],error:null})};return q;
}}}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:m.error}}));
import { OpcaoTabelaCliente,podeCriarOpcaoTabela } from "./OpcaoTabelaCliente";
const budget={id:"original",status:"draft"};
const deal={id:"deal",client_id:"sicredi",stage:"lead"};
function setup(b=budget,d=deal){
 const created=vi.fn();const qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 render(<QueryClientProvider client={qc}><OpcaoTabelaCliente budget={b} deal={d} onCreated={created}/></QueryClientProvider>);return created;
}
beforeEach(()=>{vi.clearAllMocks();m.cfg=true;m.rpc.mockResolvedValue({data:"new-option",error:null});});
describe("Opção com tabela do cliente",()=>{
 it.each(["lead","elaboracao","proposta","negociacao","orcamento"])("permite orçamento aberto em %s",stage=>expect(podeCriarOpcaoTabela(budget,{...deal,stage})).toBe(true));
 it.each(["aceite","ganho","fechamento","fechado_ganho","perdido"])("bloqueia negócio encerrado em %s",stage=>expect(podeCriarOpcaoTabela(budget,{...deal,stage})).toBe(false));
 it.each([{status:"approved"},{aprovada_em:"2026-10-01"},{aprovacoes:[{tipo:"aprovacao"}]},{fechamento_mes:"2026-10-01"},{precos_finais:true}])("bloqueia orçamento protegido %j",patch=>expect(podeCriarOpcaoTabela({...budget,...patch},deal)).toBe(false));
 it("não oferece tabela sem configuração do cliente",async()=>{m.cfg=false;setup();await waitFor(()=>expect(screen.queryByRole("button",{name:"Criar opção com tabela"})).toBeNull());expect(m.rpc).not.toHaveBeenCalled();});
 it("mostra parcelas e cria uma alternativa sem atualizar o original",async()=>{
  const created=setup();const open=await screen.findByRole("button",{name:"Criar opção com tabela"});await waitFor(()=>expect(open).toBeEnabled());fireEvent.click(open);
  const create=screen.getByRole("button",{name:"Criar nova opção"});expect(create).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Quantidade de Pílula"),{target:{value:"1"}});
  expect(screen.getByText(/Base R\$.*206,87/)).toBeVisible();expect(screen.getByText(/Total R\$.*446,60/)).toBeVisible();
  fireEvent.click(create);await waitFor(()=>expect(created).toHaveBeenCalledWith("new-option"));
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("orcamento_criar_opcao_tabela",{_budget_id:"original",_nome:"Tabela Sicredi",_taxas:taxas,_itens:[{preco_id:"p",quantidade:1,preco_unitario:446.6}]});
 });
 it("aceita meia diária, mas impede fração de vídeo",async()=>{
  setup();const open=await screen.findByRole("button",{name:"Criar opção com tabela"});await waitFor(()=>expect(open).toBeEnabled());fireEvent.click(open);
  fireEvent.change(screen.getByLabelText("Quantidade de Pílula"),{target:{value:"0.5"}});
  expect(screen.getByRole("button",{name:"Criar nova opção"})).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Quantidade de Pílula"),{target:{value:"0"}});
  fireEvent.change(screen.getByLabelText("Quantidade de Captação"),{target:{value:"0.5"}});
  expect(screen.getByRole("button",{name:"Criar nova opção"})).toBeEnabled();
 });
 it("preserva diálogo e não navega quando o servidor recusa por aprovação",async()=>{
  m.rpc.mockResolvedValue({data:null,error:new Error("Orçamento aprovado")});const created=setup();
  const open=await screen.findByRole("button",{name:"Criar opção com tabela"});await waitFor(()=>expect(open).toBeEnabled());fireEvent.click(open);
  fireEvent.change(screen.getByLabelText("Quantidade de Pílula"),{target:{value:"1"}});fireEvent.click(screen.getByRole("button",{name:"Criar nova opção"}));
  await waitFor(()=>expect(m.error).toHaveBeenCalled());expect(created).not.toHaveBeenCalled();expect(screen.getByRole("dialog")).toBeVisible();
 });
});
