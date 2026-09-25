import { describe,it,expect,vi,beforeEach } from 'vitest';
import { render,screen,fireEvent,waitFor,cleanup } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
const mock=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mock.invoke}}}));
import { SlackNotificacoes } from './SlackNotificacoes';
const pessoa={user_id:'p1',nome:'Pessoa teste',email:'teste@example.test',modos:{}};
const state={configurado:true,config:{enabled:false,channel_id:'C12345678',channel_nome:'adverse-os'},pessoas:[],entregas:[]};
function mount(){ return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><SlackNotificacoes pessoas={[pessoa]}/></QueryClientProvider>); }
beforeEach(()=>{cleanup();mock.invoke.mockReset();});
describe('configuração Slack',()=>{
  it('não oferece ativação enquanto faltar a conexão do servidor',async()=>{
    mock.invoke.mockResolvedValue({data:{...state,configurado:false},error:null});mount();
    expect(await screen.findByRole('button',{name:'Ativar envios'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Enviar teste ao canal'})).toBeDisabled();
  });
  it('mostra falha real de acesso em vez de conexão falsa',async()=>{
    mock.invoke.mockResolvedValue({data:null,error:{context:{json:async()=>({error:'Sessão inválida'})}}});mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sessão inválida');
    expect(screen.queryByRole('button',{name:'Ativar envios'})).toBeNull();
  });
  it('só solicita envio de teste após clique explícito e para o destino escolhido',async()=>{
    mock.invoke.mockResolvedValue({data:state,error:null});mount();
    const button=await screen.findByRole('button',{name:'Enviar teste ao canal'});
    expect(mock.invoke.mock.calls.every(([,args])=>args.body.action==='status')).toBe(true);
    fireEvent.click(button);
    await waitFor(()=>expect(mock.invoke).toHaveBeenCalledWith('slack-notificacoes',{body:{action:'test',destino:'canal'}}));
  });
});
