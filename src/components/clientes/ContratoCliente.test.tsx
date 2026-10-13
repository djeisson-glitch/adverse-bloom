import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ContratoCliente from './ContratoCliente';

const fixture = vi.hoisted(() => ({
  hasContrato: true, rpc: vi.fn(async () => ({error:null as null | {message:string}})),
  contrato: {id:'c',client_id:'cli',nome:'Contrato de teste',inicio:'2026-02-01',fim:'2027-01-31',ativo:true,valor_mensal:6100,diarias_mes:1,entregas_mes:8,acumulo_meses:2,validade_creditos_dias:60,limite_diarias_acumuladas:2,limite_entregas_acumuladas:16,franquia_entregas_tipo:'video_foto',observacoes:null},
  rows: [
    {id:'v',tipo:'entrega',titulo:'Vídeo',data:'2026-03-01',quantidade:40,status:'entregue',faturamento:'mensal',projetos:[]},
    {id:'f',tipo:'entrega',titulo:'Fotos',data:'2026-04-01',quantidade:4,status:'aprovado',faturamento:'mensal',projetos:[]},
    {id:'p',tipo:'entrega',titulo:'Vídeo em edição',data:'2026-10-01',quantidade:5,status:'em_edicao',faturamento:'mensal',projetos:[]},
    {id:'d',tipo:'diaria',titulo:'Captação',data:'2026-03-01',quantidade:5.5,status:'realizada',faturamento:'mensal',projetos:[]},
  ],
}));
vi.mock('@/lib/dataLocal', () => ({hojeISO:()=> '2026-10-13', mesISO:()=> '2026-10'}));
vi.mock('@/integrations/supabase/client', () => ({supabase:{rpc:fixture.rpc}}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({queryKey}: {queryKey: string[]}) => ({data: queryKey[0]==='client_contratos' ? (fixture.hasContrato ? fixture.contrato : null) : queryKey[2]==='execucao' ? fixture.rows : fixture.rows.filter(r=>r.data.slice(0,7)<=queryKey[2]),isLoading:false,isError:false}),
  useQueryClient:()=>({invalidateQueries:vi.fn()}),
}));
afterEach(()=>{cleanup();fixture.hasContrato=true;fixture.contrato.ativo=true;fixture.rpc.mockClear();fixture.rpc.mockResolvedValue({error:null});});
it('mantém a execução do contrato em destaque ao trocar o mês secundário',()=>{
 render(<MemoryRouter><ContratoCliente clientId="cli"/></MemoryRouter>);
 const overview=screen.getByRole('region',{name:'Visão geral do contrato'});
 expect(within(overview).getByText('96')).toBeInTheDocument();
 expect(within(overview).getByText('52')).toBeInTheDocument();
 expect(within(overview).getByText('6,5')).toBeInTheDocument();
 const summary=screen.getByText('Uso por mês e validade dos créditos');
 expect(summary.closest('details')).not.toHaveAttribute('open');
 fireEvent.click(summary);
 fireEvent.change(screen.getByLabelText('Mês de referência'),{target:{value:'2026-02'}});
 expect(within(overview).getByText('52')).toBeInTheDocument();
 expect(within(overview).getByText('44')).toBeInTheDocument();
 expect(within(overview).getByText('6,5')).toBeInTheDocument();
});

it('desativa o contrato existente pelo toggle sem excluir dados',async()=>{
 render(<MemoryRouter><ContratoCliente clientId="cli"/></MemoryRouter>);
 const toggle=screen.getByRole('switch',{name:'Contrato ativo'});
 expect(toggle).toBeChecked();fireEvent.click(toggle);
 await waitFor(()=>expect(fixture.rpc).toHaveBeenCalledWith('definir_contrato_ativo',{_contrato:'c',_ativo:false}));
 await waitFor(()=>expect(toggle).not.toBeDisabled());
 expect(screen.getByRole('region',{name:'Visão geral do contrato'})).toBeInTheDocument();
});
it('mostra o histórico do inativo e reativa o mesmo contrato',async()=>{
 fixture.contrato.ativo=false;
 render(<MemoryRouter><ContratoCliente clientId="cli"/></MemoryRouter>);
 expect(screen.getByRole('region',{name:'Visão geral do contrato'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('switch',{name:'Contrato desativado'}));
 await waitFor(()=>expect(fixture.rpc).toHaveBeenCalledWith('definir_contrato_ativo',{_contrato:'c',_ativo:true}));
});
it('cliente sem contrato começa desativado e só abre a configuração ao ativar',()=>{
 fixture.hasContrato=false;
 render(<MemoryRouter><ContratoCliente clientId="cli"/></MemoryRouter>);
 const toggle=screen.getByRole('switch',{name:'Contrato desativado'});
 expect(toggle).not.toBeChecked();expect(screen.queryByLabelText('Nome do contrato')).not.toBeInTheDocument();
 fireEvent.click(toggle);
 expect(screen.getByLabelText('Nome do contrato')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Salvar e ativar contrato'})).toBeInTheDocument();
 expect(fixture.rpc).not.toHaveBeenCalled();
});
it('erro no servidor preserva o estado do toggle',async()=>{
 fixture.rpc.mockResolvedValue({error:{message:'Sem permissão'}});
 render(<MemoryRouter><ContratoCliente clientId="cli"/></MemoryRouter>);
 const toggle=screen.getByRole('switch',{name:'Contrato ativo'});
 fireEvent.click(toggle);await waitFor(()=>expect(toggle).not.toBeDisabled());expect(toggle).toBeChecked();
});
