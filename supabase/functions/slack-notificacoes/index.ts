import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { groupItems, message, slackCall, SlackError, type Item } from './core.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (value: unknown, status=200) => new Response(JSON.stringify(value),{status,headers});
const checked = <T>(result: {data:T;error:unknown}) => { if(result.error) throw new Error('banco_indisponivel'); return result.data; };

Deno.serve(async req => {
  if(req.method==='OPTIONS') return new Response(null,{headers});
  if(req.method!=='POST') return json({error:'Método inválido'},405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const bot = Deno.env.get('SLACK_BOT_TOKEN');
  const workerSecret = Deno.env.get('SLACK_WORKER_SECRET');
  const origin = Deno.env.get('APP_URL') || 'https://adverse-bloom.vercel.app';
  try {
    const body = await req.json();
    if(body.action==='dispatch') {
      if(!workerSecret || req.headers.get('x-slack-worker-secret')!==workerSecret) return json({error:'Não autorizado'},401);
      if(!bot) return json({error:'Slack ainda não configurado'},503);
      const batch = checked(await admin.rpc('slack_claim')) as {token:string;items:Item[]} | null;
      if(!batch) return json({ok:true,ocupado_ou_desligado:true});
      let sent=0, pause=0;
      try {
        for(const items of groupItems(batch.items)) {
          try {
            // Snapshot target stored when enqueued. Claim cancels changed bindings.
            const target = items[0];
            const channel = target.destino==='canal' ? target.slack_target :
              (await slackCall(bot,'conversations.open',{users:target.slack_target})).channel?.id;
            if(!channel) throw new SlackError('channel_not_found',0,true);
            const result = await slackCall(bot,'chat.postMessage',{channel,...message(items,origin)});
            if(typeof result.ts!=='string') throw new SlackError('resposta_invalida');
            // An acknowledgement failure must abort: do not classify an accepted
            // Slack message as a Slack API rejection and immediately resend it.
            checked(await admin.rpc('slack_concluir',{
              _token:batch.token,_ids:items.map(n=>n.id),_ts:result.ts,
            }));
            sent++;
          } catch(error) {
            if(!(error instanceof SlackError)) throw error;
            checked(await admin.rpc('slack_concluir',{
              _token:batch.token,_ids:items.map(n=>n.id),_erro:error.code,
              _retry_seconds:error.retryAfter || Math.min(3600,30*2**Math.max(...items.map(n=>n.tentativas))),
              _permanente:error.permanent,
            }));
            if(error.retryAfter) { pause=error.retryAfter; break; }
          }
          // Same channel can have several independent groups in this batch.
          await new Promise(resolve=>setTimeout(resolve,1100));
        }
      } catch(error) {
        // Preserve lease after an ambiguous acknowledgement failure; recovery
        // is delayed and remains visible instead of creating an immediate loop.
        console.error('slack dispatch interrupted');
        return json({error:'Envio interrompido; recuperação automática agendada'},500);
      }
      checked(await admin.rpc('slack_liberar',{_token:batch.token,_pausa:pause}));
      return json({ok:true,enviadas:sent});
    }

    // All control operations require a verified user JWT AND the existing
    // notifications-admin permission. An anon API key is never sufficient.
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
    if(!jwt) return json({error:'Entre no sistema'},401);
    const {data:auth,error:authError} = await admin.auth.getUser(jwt);
    if(authError || !auth.user) return json({error:'Sessão inválida'},401);
    if(!checked(await admin.rpc('pode_admin_notif',{_uid:auth.user.id}))) return json({error:'Só a gestão pode configurar o Slack'},403);

    if(body.action==='status') {
      const config = checked(await admin.from('slack_config').select('enabled,channel_id,channel_nome').single());
      const pessoas = checked(await admin.from('slack_pessoas').select('*'));
      const entregas = checked(await admin.from('slack_entregas')
        .select('id,user_id,destino,status,erro,tentativas,enviada_em,created_at').order('created_at',{ascending:false}).limit(100));
      return json({config,pessoas,entregas,configurado:!!bot && !!workerSecret});
    }
    if(body.action==='retry') {
      if(typeof body.id!=='string') return json({error:'Informe o aviso'},400);
      checked(await admin.from('slack_entregas').update({status:'pendente',tentativas:0,erro:null,proxima_em:new Date().toISOString()})
        .eq('id',body.id).eq('status','falhou'));
      return json({ok:true});
    }
    if(body.action==='toggle' && body.enabled===false) {
      checked(await admin.from('slack_config').update({enabled:false}).eq('id',true));
      return json({ok:true});
    }
    if(!bot || !workerSecret) return json({error:'O aplicativo Slack ainda precisa ser configurado no servidor.'},503);
    if(body.action==='toggle') {
      if(body.enabled!==true) return json({error:'Opção inválida'},400);
      await slackCall(bot,'auth.test',{});
      checked(await admin.from('slack_config').update({enabled:true}).eq('id',true));
    } else if(body.action==='person') {
      if(typeof body.user_id!=='string' || !/^[UW][A-Z0-9]{8,}$/.test(body.slack_user_id || '') || typeof body.enabled!=='boolean')
        return json({error:'Informe o ID de membro do Slack e a pessoa do sistema'},400);
      const profile = checked(await admin.from('profiles').select('id').eq('id',body.user_id).maybeSingle());
      if(!profile) return json({error:'Pessoa não encontrada no sistema'},400);
      const result = await slackCall(bot,'users.info',{user:body.slack_user_id});
      const team = await slackCall(bot,'auth.test',{});
      if(result.user?.deleted || result.user?.is_bot || !result.user || result.user.team_id!==team.team_id)
        return json({error:'Escolha uma pessoa ativa deste workspace'},400);
      checked(await admin.from('slack_pessoas').upsert({user_id:body.user_id,slack_user_id:body.slack_user_id,
        slack_nome:result.user.real_name || result.user.name,enabled:body.enabled}));
    } else if(body.action==='channel') {
      if(!/^[CG][A-Z0-9]{8,}$/.test(body.channel_id || '')) return json({error:'Informe o ID do canal'},400);
      const result = await slackCall(bot,'conversations.info',{channel:body.channel_id});
      if(!result.channel?.is_member || result.channel.is_archived || result.channel.is_ext_shared || result.channel.is_shared)
        return json({error:'Adicione o aplicativo a um canal interno e ativo da equipe'},400);
      checked(await admin.from('slack_config').update({channel_id:body.channel_id,channel_nome:result.channel.name}).eq('id',true));
    } else if(body.action==='test') {
      // Button explicitly sends a test only to the signed-in admin / configured channel.
      const config = checked(await admin.from('slack_config').select('channel_id').single());
      const person = checked(await admin.from('slack_pessoas').select('slack_user_id').eq('user_id',auth.user.id).maybeSingle());
      const target = body.destino==='canal' ? config?.channel_id : person?.slack_user_id;
      if(!target) return json({error:'Configure o destino antes de testar'},400);
      const channel = body.destino==='canal' ? target : (await slackCall(bot,'conversations.open',{users:target})).channel.id;
      await slackCall(bot,'chat.postMessage',{channel,text:'Teste do Adverse OS: este destino está pronto para receber notificações.',unfurl_links:false});
    } else return json({error:'Ação inválida'},400);
    return json({ok:true});
  } catch(error) {
    // Never echo raw request bodies, tokens or external response contents.
    return json({error:error instanceof SlackError ? `Slack: ${error.code}` : 'Não foi possível concluir. Tente novamente.'},500);
  }
});
