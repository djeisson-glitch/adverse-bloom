import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ControleOrcamentoMensal } from './OrcamentoMensal';
import { OrcamentosFechamento } from '@/components/OrcamentosFechamento';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
const dados={id:'mes',numero:500,cliente:'Sicredi',mes:'2026-10-01',total:100,revisao:4,projetos:[{project_id:'p',projeto:'Captação',receita:null,custo:null}]};
function show(ui:React.ReactNode){return render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>{ui}</QueryClientProvider></MemoryRouter>);}
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('salva receita/custo no orçamento mensal e mantém custo zero explícito',async()=>{
 mock.rpc.mockResolvedValue({data:{...dados,revisao:5,projetos:[{...dados.projetos[0],receita:100,custo:0}]},error:null});
 show(<ControleOrcamentoMensal dados={dados}/>);
 expect(screen.getByText('Falta distribuir R$ 100,00')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Parte do fee · Captação'),{target:{value:'100'}});
 fireEvent.change(screen.getByLabelText('Custo no mês · Captação'),{target:{value:'0'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar divisão e custos'}));
 await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith('salvar_orcamento_mensal',{_budget:'mes',_revisao:4,_projetos:[{project_id:'p',receita:100,custo:0}]}));
 await waitFor(()=>expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument());
 expect(screen.getByRole('link',{name:'Captação'})).toHaveAttribute('href','/projetos/p?retorno=%2Forcamentos-mensais%2Fmes');
});
it('mantém o rascunho e mostra erro ao rejeitar uma versão antiga',async()=>{
 mock.rpc.mockResolvedValue({data:null,error:new Error('O fechamento mudou. Recarregue antes de salvar.')});
 show(<ControleOrcamentoMensal dados={dados}/>);
 fireEvent.change(screen.getByLabelText('Custo no mês · Captação'),{target:{value:'25'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar divisão e custos'}));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('O fechamento mudou'));
 expect(screen.getByLabelText('Custo no mês · Captação')).toHaveValue(25);
 expect(screen.getByText('Alterações não salvas')).toBeInTheDocument();
});
it('mostra um único orçamento para todos os projetos mensais',()=>{
 show(<OrcamentosFechamento id="f" mensal={{budget_id:'mes',orcamento_numero:500,ref_mes:'2026-10-01',total:100}} rows={['p','q'].map(project_id=>({project_id,projeto:project_id,budget_id:'mes',orcamento_numero:500,baldes:['mensal'],mensal:true}))}/>);
 expect(screen.getAllByRole('link')).toHaveLength(1);
 expect(screen.getByRole('link')).toHaveAttribute('href','/orcamentos-mensais/mes');
 expect(screen.getByRole('button',{name:'Copiar número'})).toBeInTheDocument();
});
