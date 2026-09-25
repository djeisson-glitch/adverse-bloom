import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { PessoaMatriz } from '@/hooks/useNotifPrefs';

type Vinculo = {user_id:string;slack_user_id:string;slack_nome:string;enabled:boolean};
type Entrega = {id:string;user_id:string;destino:string;status:string;erro:string|null;tentativas:number;enviada_em:string|null;created_at:string};
type Status = {configurado:boolean;config:{enabled:boolean;channel_id:string|null;channel_nome:string|null};pessoas:Vinculo[];entregas:Entrega[]};
async function api(body: Record<string,unknown>): Promise<Status> {
  const {data,error} = await supabase.functions.invoke('slack-notificacoes',{body});
  if(error) {
    let reason = 'Não foi possível acessar a integração Slack. Verifique se ela já foi publicada.';
    try { const result = await error.context?.json(); if(result?.error) reason=result.error; } catch { /* generic safe error */ }
    throw new Error(reason);
  }
  if(data?.error) throw new Error(data.error);
  return data;
}
export function SlackNotificacoes({pessoas}: {pessoas:PessoaMatriz[]}) {
  const qc = useQueryClient();
  const [canal,setCanal] = useState('');
  const status = useQuery({queryKey:['slack-status'],queryFn:()=>api({action:'status'}),refetchInterval:30000,retry:false});
  const save = useMutation({
    mutationFn:api,
    onSuccess:(_data,body)=>{ qc.invalidateQueries({queryKey:['slack-status']}); toast.success(body.action==='test' ? 'Mensagem de teste enviada ao Slack' : 'Configuração salva'); },
    onError:(e:Error)=>toast.error(e.message),
  });
  const data = status.data;
  return <Card className="glass-card"><CardContent className="space-y-4 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold">Slack · avisos da equipe</h2>
        <p className="text-xs text-muted-foreground">Mensagem direta para cada responsável e acompanhamento no canal da produção.</p></div>
      {data && <Button variant={data.config.enabled ? 'outline' : 'default'} disabled={save.isPending || (!data.configurado && !data.config.enabled)}
        onClick={()=>save.mutate({action:'toggle',enabled:!data.config.enabled})}>{data.config.enabled ? 'Pausar envios' : 'Ativar envios'}</Button>}
    </div>
    {status.isPending && <p className="text-sm text-muted-foreground">Verificando conexão…</p>}
    {status.isError && <div role="alert" className="text-sm text-destructive">{status.error.message}
      <Button className="ml-2" variant="outline" size="sm" onClick={()=>status.refetch()}>Tentar novamente</Button></div>}
    {data && <>
      <p className="text-xs text-muted-foreground">{!data.configurado ? 'Aguardando instalação do aplicativo Slack e configuração da conexão no servidor.' :
        data.config.enabled ? 'Envios ativados. Avisos imediatos entram na fila em até um minuto; resumos seguem os horários abaixo.' : 'Envios pausados. Ative depois de vincular as pessoas e o canal.'}</p>
      <div className="space-y-2 rounded-lg border border-border/50 p-3">
        <label htmlFor="slack-canal" className="text-sm font-medium">Canal de acompanhamento {data.config.channel_nome && `· #${data.config.channel_nome}`}</label>
        <p className="text-xs text-muted-foreground">Produção, prazos e menções. Inclua o aplicativo no canal #adverse-os e copie o ID nas informações do canal. Avisos comerciais e resumos pessoais seguem somente por mensagem direta.</p>
        <div className="flex flex-wrap gap-2"><Input id="slack-canal" aria-label="ID do canal Slack" className="max-w-xs" placeholder={data.config.channel_id || 'ID do canal (C…)'} value={canal} onChange={e=>setCanal(e.target.value.trim())}/>
          <Button size="sm" variant="outline" disabled={save.isPending || !data.configurado || !/^[CG][A-Z0-9]{8,}$/.test(canal)} onClick={()=>save.mutate({action:'channel',channel_id:canal})}>Salvar canal</Button>
          <Button size="sm" variant="outline" disabled={save.isPending || !data.configurado || !data.config.channel_id} onClick={()=>save.mutate({action:'test',destino:'canal'})}>Enviar teste ao canal</Button></div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Mensagens diretas</p>
        <p className="text-xs text-muted-foreground">No perfil da pessoa no Slack, abra o menu e escolha “Copiar ID do membro”. Confira o nome retornado ao salvar.</p>
        {pessoas.map(p=><Pessoa key={`${p.user_id}:${data.pessoas.find(v=>v.user_id===p.user_id)?.slack_user_id || ''}:${data.pessoas.find(v=>v.user_id===p.user_id)?.enabled}`} pessoa={p} vinculo={data.pessoas.find(v=>v.user_id===p.user_id)} disabled={save.isPending || !data.configurado} salvar={body=>save.mutate(body)}/>)}
        <Button size="sm" variant="outline" disabled={save.isPending || !data.configurado} onClick={()=>save.mutate({action:'test',destino:'direta'})}>Enviar teste para mim</Button>
      </div>
      <div className="space-y-2 border-t border-border/50 pt-3">
        <p className="text-sm font-medium">Últimos envios <span className="text-xs font-normal text-muted-foreground">(até 100 registros)</span></p>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {['enviada','pendente','enviando','falhou','cancelada'].map(s=><span key={s}>{ROTULOS[s]}: {data.entregas.filter(e=>e.status===s).length}</span>)}
        </div>
        {data.entregas.length===0 && <p className="text-xs text-muted-foreground">Nenhum aviso registrado. A integração começa com os novos eventos após a ativação.</p>}
        <div className="max-h-56 space-y-1 overflow-auto">{data.entregas.slice(0,20).map(e=><div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/40 px-2 py-1.5 text-xs">
          <span>{e.destino==='canal' ? 'Canal de acompanhamento' : pessoas.find(p=>p.user_id===e.user_id)?.nome || 'Mensagem direta'} · {ROTULOS[e.status]} · {new Date(e.enviada_em || e.created_at).toLocaleString('pt-BR')}
            {e.erro && <span className="ml-1 text-destructive">({e.erro})</span>}</span>
          {e.status==='falhou' && <Button size="sm" variant="outline" disabled={save.isPending} onClick={()=>save.mutate({action:'retry',id:e.id})}>Tentar de novo</Button>}
        </div>)}</div>
        <p className="text-[11px] text-muted-foreground">“Aceitos pelo Slack” confirma o recebimento pelo serviço, não a leitura pela pessoa. As preferências por tipo continuam valendo para os avisos automáticos.</p>
      </div>
    </>}
  </CardContent></Card>;
}
const ROTULOS:Record<string,string> = {enviada:'Aceitos pelo Slack',pendente:'Na fila',enviando:'Em envio',falhou:'Precisam de atenção',cancelada:'Cancelados'};
function Pessoa({pessoa,vinculo,disabled,salvar}: {pessoa:PessoaMatriz;vinculo?:Vinculo;disabled:boolean;salvar:(body:Record<string,unknown>)=>void}) {
  const [id,setId]=useState(vinculo?.slack_user_id || '');
  const body={action:'person',user_id:pessoa.user_id,slack_user_id:id,enabled:true};
  return <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 p-2">
    <div className="min-w-40 flex-1"><p className="text-sm">{pessoa.nome}</p><p className="text-xs text-muted-foreground">{vinculo ? `${vinculo.slack_nome} · ${vinculo.enabled ? 'vinculado' : 'pausado'}` : 'Sem vínculo com o Slack'}</p></div>
    <Input aria-label={`ID Slack de ${pessoa.nome}`} className="h-8 w-40" placeholder="ID do membro (U…)" value={id} onChange={e=>setId(e.target.value.trim())}/>
    <Button size="sm" variant="outline" disabled={disabled || !/^[UW][A-Z0-9]{8,}$/.test(id)} onClick={()=>salvar(body)}>Salvar vínculo</Button>
    {vinculo && <Button size="sm" variant="ghost" disabled={disabled} onClick={()=>salvar({...body,slack_user_id:vinculo.slack_user_id,enabled:!vinculo.enabled})}>{vinculo.enabled ? 'Pausar' : 'Retomar'}</Button>}
  </div>;
}
