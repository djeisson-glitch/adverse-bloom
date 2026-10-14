import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import EntregasContrato from './EntregasContrato';
import type { MovimentoContrato } from '@/lib/consumoContrato';
const mock = vi.hoisted(() => ({ update:vi.fn(), from:vi.fn(), eq:vi.fn(), single:vi.fn(async()=>({error:null as null | {message:string}})), invalidate:vi.fn(), error:vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
 supabase: {
  from: (table:string) => {
   mock.from(table);
   return { update: (patch:unknown) => {
    mock.update(patch);
    return { eq: (key:string,id:string) => {
     mock.eq(key,id);
     return { select: () => ({single:mock.single}) };
    }};
   }};
  },
 },
}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({invalidateQueries:mock.invalidate})}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:mock.error}}));
const p = {id:'p',nome:'Captação SLC',faturamento:'mensal'};
const q = {id:'q',nome:'Evento pontual',faturamento:'avulso'};
const m:MovimentoContrato = {id:'v',tipo:'entrega',titulo:'Vídeo final',data:'2026-03-01',tipo_midia:'video',quantidade:1,status:'entregue',faturamento:'mensal',projetos:[p]};
const rows:MovimentoContrato[] = [m,{...m,id:'f',titulo:'Fotos',tipo_midia:'foto',ignorar_contrato:true},{...m,id:'a',titulo:'Vídeo do evento',faturamento:'avulso',projetos:[q]}];
const show=(movimentos=rows)=>render(<MemoryRouter><EntregasContrato movimentos={movimentos} pendentes={0} clientId="cli"/></MemoryRouter>);
afterEach(()=>{cleanup();vi.clearAllMocks();mock.single.mockResolvedValue({error:null});});
it('agrupa por projeto e expande apenas um grupo por vez',()=>{
 show();expect(screen.queryByLabelText('Tipo de Vídeo final')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/Captação SLC/}));
 expect(screen.getByLabelText('Tipo de Vídeo final')).toBeInTheDocument();
 expect(screen.getByLabelText('Tipo de Fotos')).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Abrir projeto'})).toHaveAttribute('href','/projetos/p?retorno=%2Fclientes%2Fcli%3Faba%3Dcontrato');
 fireEvent.click(screen.getByRole('button',{name:/Evento pontual/}));
 expect(screen.queryByLabelText('Tipo de Vídeo final')).not.toBeInTheDocument();
 expect(screen.getByLabelText('Tipo de Vídeo do evento')).toBeInTheDocument();
});
it('busca sem acentos por projeto e por entrega, preservando itens à parte',()=>{
 show();fireEvent.change(screen.getByLabelText('Buscar entrega do contrato'),{target:{value:'captacao'}});
 expect(screen.getByRole('button',{name:/Captação SLC/})).toBeInTheDocument();expect(screen.queryByRole('button',{name:/Evento pontual/})).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Buscar entrega do contrato'),{target:{value:'video do evento'}});
 fireEvent.click(screen.getByRole('button',{name:/Evento pontual/}));expect(screen.getByLabelText('Tipo de Vídeo do evento')).toBeInTheDocument();
});
it('filtros distinguem ignoradas e à parte',()=>{
 show();fireEvent.change(screen.getByLabelText('Filtrar entregas do contrato'),{target:{value:'ignoradas'}});
 fireEvent.click(screen.getByRole('button',{name:/Captação SLC/}));expect(screen.queryByText('Vídeo final')).not.toBeInTheDocument();expect(screen.getByLabelText('Tipo de Fotos')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Filtrar entregas do contrato'),{target:{value:'fora'}});
 expect(screen.queryByRole('button',{name:/Captação SLC/})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:/Evento pontual/})).toBeInTheDocument();
});
it('salva só a cobrança do projeto e atualiza os saldos e telas dependentes',async()=>{
 show();fireEvent.change(screen.getByLabelText('Faturamento de Captação SLC'),{target:{value:'avulso'}});
 expect(screen.getByLabelText('Faturamento de Captação SLC')).toBeDisabled();
 await waitFor(()=>expect(mock.invalidate).toHaveBeenCalledWith({queryKey:['contrato-movimentos']}));
 expect(mock.from).toHaveBeenCalledWith('projects');expect(mock.update).toHaveBeenCalledWith({faturamento:'avulso'});expect(mock.eq).toHaveBeenCalledWith('id','p');
 await waitFor(()=>expect(screen.getByLabelText('Faturamento de Captação SLC')).not.toBeDisabled());
});
it('falha ao salvar preserva a cobrança e não invalida o saldo',async()=>{
 mock.single.mockResolvedValue({error:{message:'Sem permissão'}});show();
 fireEvent.change(screen.getByLabelText('Faturamento de Captação SLC'),{target:{value:'avulso'}});
 await waitFor(()=>expect(mock.error).toHaveBeenCalled());expect(mock.invalidate).not.toHaveBeenCalled();expect(screen.getByLabelText('Faturamento de Captação SLC')).toHaveValue('mensal');
});
it('mostra projeto que só tem diária e avisa quando é compartilhada',()=>{
 show([{...m,id:'dia',tipo:'diaria',status:'realizada',quantidade:0.5,projetos:[p,q]}]);
 fireEvent.click(screen.getByRole('button',{name:/Captação SLC/}));expect(screen.getByText(/Há captações compartilhadas/)).toBeInTheDocument();expect(screen.getAllByText(/0,5 diárias realizadas/)).toHaveLength(2);
});
