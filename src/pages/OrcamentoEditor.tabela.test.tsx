import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const m=vi.hoisted(()=>({update:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>({update:(patch:unknown)=>{m.update(patch);return{eq:()=>Promise.resolve({error:null})};}})}}));
import { BudgetItemRow } from "./OrcamentoEditor";
const item={id:"i",budget_id:"b",categoria_id:"c",descricao:"Pílula",quantity:1,diaria:1,client_unit_price:446.6,client_price:446.6,custo_unitario:0,tira_taxa:false,observacoes:null,ordem:1};
function setup(tabelado=true, restored=item){
 return render(<QueryClientProvider client={new QueryClient({defaultOptions:{mutations:{retry:false}}})}>
   <BudgetItemRow item={restored} codigo="011" porHora={!tabelado} idx={1} onChanged={()=>{}}
    tabela={tabelado?{fatorLiquido:.84,margem:37.68}:undefined}/>
 </QueryClientProvider>);
}
describe("item da tabela Sicredi",()=>{
 beforeEach(()=>m.update.mockReset());
 it("mostra a base e permite editar o preço final sem sobrescrever ao reabrir",async()=>{
   const view=setup();
   expect(screen.getByText(/206,87/)).toBeInTheDocument();
   const preco=screen.getByLabelText("Preço unitário final");
   fireEvent.change(preco,{target:{value:"500"}}); fireEvent.blur(preco);
   await waitFor(()=>expect(m.update).toHaveBeenCalledWith(expect.objectContaining({client_unit_price:500,client_price:500})));
   expect(screen.getByText(/231,60/)).toBeInTheDocument();
   const gravado=m.update.mock.calls.at(-1)![0];
   view.unmount(); setup(true,{...item,...gravado});
   expect(screen.getByLabelText("Preço unitário final")).toHaveValue("500");
   expect(m.update).toHaveBeenCalledTimes(1);
 });
 it("quantidade multiplica o preço final; base é unitária",async()=>{
   setup(); const qtd=screen.getByLabelText("Quantidade");
   fireEvent.change(qtd,{target:{value:"3"}});fireEvent.blur(qtd);
   await waitFor(()=>expect(m.update).toHaveBeenCalledWith(expect.objectContaining({quantity:3,client_price:1339.8})));
   expect(screen.getByText(/206,87/)).toBeInTheDocument();
 });
 it("conserva os campos dos orçamentos comuns",()=>{
   setup(false);
   expect(screen.getByLabelText("Valor/hora")).toHaveValue("446.6");
   expect(screen.queryByText("Base unitária")).toBeNull();
 });
});
