import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DiariasProjeto } from './DiariasProjeto';
const f = vi.hoisted(()=>({rows:[] as any[],error:false,save:vi.fn(),cancel:vi.fn(),remove:vi.fn(),confirm:vi.fn(async()=>true),toastError:vi.fn()}));
vi.mock('@tanstack/react-query',()=>({useQuery:({queryKey}:any)=>({data:queryKey[0]==='projeto-diarias'?f.rows:[],isLoading:false,isError:f.error,refetch:vi.fn()})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/hooks/useTeamMembers',()=>({useActiveTeamMembers:()=>({data:[]})}));
vi.mock('@/hooks/useSaidasProducao',()=>({useSalvarSaida:()=>({mutate:f.save,isPending:false}),useCancelarSaida:()=>({mutate:f.cancel,isPending:false}),useExcluirSaida:()=>({mutate:f.remove,isPending:false})}));
vi.mock('@/components/ui/confirm',()=>({useConfirm:()=>f.confirm}));
vi.mock('@/lib/dataLocal',()=>({hojeISO:()=> '2026-10-14'}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:f.toastError}}));
const dia = {id:'d1',titulo:'Captação',tipo:'diaria',data:'2026-10-01',project_id:'p1',status:'realizada',fracao:0.5,equipe:[]};
const show=()=>render(<DiariasProjeto projectId="p1" projectName="SLC" diariasContratadas={2} clientId="cli"/>);
afterEach(()=>{cleanup();vi.clearAllMocks();f.rows=[];f.error=false;f.confirm.mockResolvedValue(true);});
it('adiciona meia diária já realizada no projeto correto',()=>{
 show();fireEvent.click(screen.getByRole('button',{name:'Adicionar diária'}));
 fireEvent.change(screen.getByLabelText('Data'),{target:{value:'2026-10-01'}});
 fireEvent.change(screen.getByLabelText('Situação da diária'),{target:{value:'realizada'}});
 fireEvent.click(screen.getByRole('button',{name:'Meia diária'}));
 fireEvent.click(screen.getByRole('button',{name:'Salvar diária'}));
 expect(f.save).toHaveBeenCalledWith(expect.objectContaining({project_id:'p1',status:'realizada',fracao:0.5,dia_inteiro:false,data:'2026-10-01',tipo:'diaria'}),expect.anything());
});
it('nova diária fica agendada por padrão e não aceita realização futura',()=>{
 show();fireEvent.click(screen.getByRole('button',{name:'Adicionar diária'}));
 expect(screen.getByRole('button',{name:'Salvar diária'})).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Data'),{target:{value:'2026-10-20'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar diária'}));
 expect(f.save).toHaveBeenCalledWith(expect.objectContaining({status:'agendada',fracao:1}),expect.anything());
 f.save.mockClear();fireEvent.change(screen.getByLabelText('Situação da diária'),{target:{value:'realizada'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar diária'}));expect(f.save).not.toHaveBeenCalled();expect(f.toastError).toHaveBeenCalled();
});
it('remover cancela apenas o registro escolhido, sem excluir definitivamente',async()=>{
 f.rows=[dia];show();fireEvent.click(screen.getByRole('button',{name:'Remover diária de 2026-10-01'}));
 await waitFor(()=>expect(f.cancel).toHaveBeenCalledWith('d1',expect.anything()));
 expect(f.confirm).toHaveBeenCalledWith(expect.objectContaining({title:'Remover diária do saldo?'}));expect(f.remove).not.toHaveBeenCalled();
});
it('desistir da remoção preserva a diária',async()=>{
 f.confirm.mockResolvedValue(false);f.rows=[dia];show();fireEvent.click(screen.getByRole('button',{name:'Remover diária de 2026-10-01'}));
 await waitFor(()=>expect(f.confirm).toHaveBeenCalled());expect(f.cancel).not.toHaveBeenCalled();
});
it('soma frações, exclui canceladas e separa realizadas de agendadas',()=>{
 f.rows=[dia,{...dia,id:'d2',status:'agendada'}, {...dia,id:'d3',status:'cancelada',fracao:1}];show();
 expect(screen.getByText('1 de 2 registradas · 0,5 realizadas · faltam 1')).toBeInTheDocument();
});
it('corrige status existente sem sobrescrever equipe, custos ou fração',()=>{
 f.rows=[{...dia,status:'agendada'}];show();
 fireEvent.change(screen.getByLabelText('Status da diária de 2026-10-01'),{target:{value:'realizada'}});
 expect(f.save).toHaveBeenCalledWith({id:'d1',titulo:'Captação',tipo:'diaria',data:'2026-10-01',status:'realizada'},expect.anything());
});
it('mostra falha de consulta e impede inclusão sem carregar o histórico',()=>{
 f.error=true;show();expect(screen.getByText(/Não foi possível carregar/)).toBeInTheDocument();expect(screen.getByRole('button',{name:'Adicionar diária'})).toBeDisabled();expect(screen.queryByText('Nenhuma diária registrada.')).not.toBeInTheDocument();
});
