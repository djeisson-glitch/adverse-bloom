import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCancelarSaida, useSalvarSaida, invalidarSaidas } from './useSaidasProducao';
const f=vi.hoisted(()=>({update:vi.fn(),eq:vi.fn(),single:vi.fn(async()=>({data:{id:'d1'},error:null as any})),sync:vi.fn(async()=>({data:{},error:null}))}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:f.sync},from:()=>({update:(patch:any)=>{f.update(patch);return {eq:(k:string,id:string)=>{f.eq(k,id);return {select:()=>({single:f.single})}}}}})}}));
afterEach(()=>{cleanup();vi.clearAllMocks();f.single.mockResolvedValue({data:{id:'d1'},error:null});});
function setup(){const qc=new QueryClient({defaultOptions:{mutations:{retry:false}}});const invalidate=vi.spyOn(qc,'invalidateQueries');const wrapper=({children}:any)=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;return {qc,invalidate,wrapper};}
it('cancelamento confirmado atualiza o saldo do contrato e a lista de projetos',async()=>{
 const {wrapper,invalidate}=setup();const {result}=renderHook(()=>useCancelarSaida(),{wrapper});
 await act(async()=>{await result.current.mutateAsync('d1');});
 expect(f.update).toHaveBeenCalledWith({status:'cancelada'});expect(f.eq).toHaveBeenCalledWith('id','d1');
 expect(invalidate).toHaveBeenCalledWith({queryKey:['contrato-movimentos']});expect(invalidate).toHaveBeenCalledWith({queryKey:['projeto-diarias']});expect(invalidate).toHaveBeenCalledWith({queryKey:['producao_saidas']});
});
it('update sem permissão não sincroniza calendário nem anuncia atualização de saldo',async()=>{
 f.single.mockResolvedValue({data:{id:'d1'},error:{message:'Nenhuma linha atualizada'}});
 const {wrapper,invalidate}=setup();const {result}=renderHook(()=>useSalvarSaida(),{wrapper});
 await act(async()=>{await expect(result.current.mutateAsync({id:'d1',tipo:'diaria',titulo:'Captação',data:'2026-10-01',status:'realizada'})).rejects.toBeTruthy();});
 expect(f.sync).not.toHaveBeenCalled();expect(invalidate).not.toHaveBeenCalled();
});
