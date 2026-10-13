import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ClassificarEntregaContrato from './ClassificarEntregaContrato';
import EntregasContrato from './EntregasContrato';
import type { MovimentoContrato } from '@/lib/consumoContrato';
const mock=vi.hoisted(()=>({update:vi.fn(),eq:vi.fn(),single:vi.fn(async()=>({data:{id:'v'},error:null as null | {message:string}})),invalidate:vi.fn(),error:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({update:(patch:unknown)=>{mock.update(patch);return {eq:(field:string,id:string)=>{mock.eq(field,id);return {select:()=>({single:mock.single})}}}}})}}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({invalidateQueries:mock.invalidate})}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:mock.error}}));
const m:MovimentoContrato={id:'v',tipo:'entrega',titulo:'Vídeo final',tipo_midia:'video',data:'2026-03-01',quantidade:1,status:'entregue',faturamento:'mensal',projetos:[]};
afterEach(()=>{cleanup();vi.clearAllMocks();mock.single.mockResolvedValue({data:{id:'v'},error:null});});
it('ignora sem alterar tipo, status ou faturamento e atualiza os saldos',async()=>{
 render(<ClassificarEntregaContrato movimento={m}/>);
 fireEvent.change(screen.getByLabelText('Tipo de Vídeo final'),{target:{value:'ignorar'}});
 await waitFor(()=>expect(mock.invalidate).toHaveBeenCalledWith({queryKey:['contrato-movimentos']}));
 expect(mock.update).toHaveBeenCalledWith({ignorar_contrato:true});expect(mock.eq).toHaveBeenCalledWith('id','v');
});
it('encontra a entrega ignorada e permite reincluir preservando o tipo',async()=>{
 render(<MemoryRouter><EntregasContrato movimentos={[{...m,ignorar_contrato:true},{...m,id:'f',titulo:'Fotos',tipo_midia:'foto'}]} pendentes={0} clientId="cli"/></MemoryRouter>);
 fireEvent.click(screen.getByText('Entregas'));
 fireEvent.change(screen.getByLabelText('Filtrar entregas do contrato'),{target:{value:'ignoradas'}});
 expect(screen.getByText('Vídeo final')).toBeInTheDocument();
 expect(screen.queryByLabelText('Tipo de Fotos')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Reincluir'}));
 await waitFor(()=>expect(mock.update).toHaveBeenCalledWith({ignorar_contrato:false}));
});
it('uma falha não mostra classificação salva nem invalida o saldo',async()=>{
 mock.single.mockResolvedValue({data:{id:'v'},error:{message:'Sem permissão'}});
 render(<ClassificarEntregaContrato movimento={m}/>);
 fireEvent.change(screen.getByLabelText('Tipo de Vídeo final'),{target:{value:'ignorar'}});
 await waitFor(()=>expect(mock.error).toHaveBeenCalled());expect(mock.invalidate).not.toHaveBeenCalled();expect(screen.getByLabelText('Tipo de Vídeo final')).toHaveValue('video');
});
