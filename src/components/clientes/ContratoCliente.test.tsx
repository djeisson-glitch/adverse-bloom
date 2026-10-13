import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ContratoCliente from './ContratoCliente';

const fixture = vi.hoisted(() => ({
  contrato: {id:'c',client_id:'cli',nome:'Contrato de teste',inicio:'2026-02-01',fim:'2027-01-31',ativo:true,valor_mensal:6100,diarias_mes:1,entregas_mes:8,acumulo_meses:2,validade_creditos_dias:60,limite_diarias_acumuladas:2,limite_entregas_acumuladas:16,franquia_entregas_tipo:'video_foto',observacoes:null},
  rows: [
    {id:'v',tipo:'entrega',titulo:'Vídeo',data:'2026-03-01',quantidade:40,status:'entregue',faturamento:'mensal',projetos:[]},
    {id:'f',tipo:'entrega',titulo:'Fotos',data:'2026-04-01',quantidade:4,status:'aprovado',faturamento:'mensal',projetos:[]},
    {id:'p',tipo:'entrega',titulo:'Vídeo em edição',data:'2026-10-01',quantidade:5,status:'em_edicao',faturamento:'mensal',projetos:[]},
    {id:'d',tipo:'diaria',titulo:'Captação',data:'2026-03-01',quantidade:5.5,status:'realizada',faturamento:'mensal',projetos:[]},
  ],
}));
vi.mock('@/lib/dataLocal', () => ({hojeISO:()=> '2026-10-13', mesISO:()=> '2026-10'}));
vi.mock('@/integrations/supabase/client', () => ({supabase:{}}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({queryKey}: {queryKey: string[]}) => ({data: queryKey[0]==='client_contratos' ? fixture.contrato : queryKey[2]==='execucao' ? fixture.rows : fixture.rows.filter(r=>r.data.slice(0,7)<=queryKey[2]),isLoading:false,isError:false}),
  useQueryClient:()=>({invalidateQueries:vi.fn()}),
}));
afterEach(cleanup);
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
