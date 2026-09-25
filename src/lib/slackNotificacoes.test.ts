import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { groupItems, message, safeLink, slackCall, type Item } from '../../supabase/functions/slack-notificacoes/core';
// jsdom 20 lacks AbortSignal.timeout; requests are mocked in these tests.
beforeAll(()=>vi.stubGlobal('AbortSignal',{timeout:()=>new AbortController().signal}));
afterAll(()=>vi.unstubAllGlobals());
const item = (patch:Partial<Item>={}):Item => ({id:'1',user_id:'p1',tentativas:1,slack_target:'U12345678',destino:'direta',titulo:'Revisar vídeo',corpo:'Cliente pediu ajuste',link:'/projetos/1',nivel:1,group_key:'ajuste:1',...patch});
describe('entrega Slack',()=>{
  it('separa destinatários e canal, agrupando resumos por destino',()=>{
    const groups=groupItems([item(),item({id:'2'}),item({id:'3',slack_target:'U98765432'}),item({id:'4',destino:'canal',slack_target:'C12345678'}),item({id:'5',nivel:2}),item({id:'6',nivel:2,group_key:'outro'})]);
    expect(groups.map(g=>g.length)).toEqual([2,1,1,2]);
  });
  it.each(['https://evil.test','//evil.test','javascript:alert(1)','/\\evil.test','https://user:pass@app.test/x'])('não manda links externos ou credenciais: %s',link=>{
    expect(safeLink(link,'https://app.test')).toBe('https://app.test/notificacoes');
  });
  it('preserva o link interno e o texto sem executar menções Slack',()=>{
    const payload=message([item({titulo:'<!channel> <@U12345678>'})],'https://app.test');
    expect(payload.mrkdwn).toBe(false);
    expect(payload.blocks[1]).toMatchObject({text:{type:'plain_text'}});
    expect(payload.blocks[2]).toMatchObject({elements:[{url:'https://app.test/projetos/1'}]});
  });
  it('mantém cada pendência do resumo acessível e respeita limite de blocos/texto',()=>{
    const payload=message(Array.from({length:10},(_,i)=>item({id:String(i),nivel:2,corpo:'x'.repeat(10000)})),'https://app.test');
    expect(payload.blocks).toHaveLength(21);
    expect(payload.text.length).toBeLessThan(4000);
    expect(JSON.stringify(payload.blocks[1]).length).toBeLessThan(3000);
  });
  it.each([['users.info','user','U12345678'],['conversations.info','channel','C12345678']])('consulta %s com parâmetros GET',async(method,key,value)=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true})));
    await slackCall('fake',method,{[key]:value},fetcher);
    expect(fetcher).toHaveBeenCalledWith(`https://slack.com/api/${method}?${key}=${value}`,expect.objectContaining({method:'GET',body:undefined}));
  });
  it('429 usa Retry-After e não é tratado como entrega',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('',{status:429,headers:{'retry-after':'120'}}));
    await expect(slackCall('fake','chat.postMessage',{},fetcher)).rejects.toMatchObject({code:'ratelimited',retryAfter:120,permanent:false});
  });
  it('HTTP 200 com ok:false é uma falha permanente quando falta permissão',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:false,error:'missing_scope'})));
    await expect(slackCall('fake','chat.postMessage',{},fetcher)).rejects.toMatchObject({code:'missing_scope',permanent:true});
  });
  it('timeout permite nova tentativa sem revelar informações do erro',async()=>{
    const fetcher=vi.fn().mockRejectedValue(new Error('token-secreto'));
    await expect(slackCall('fake','chat.postMessage',{},fetcher)).rejects.toMatchObject({message:'rede_ou_timeout',permanent:false});
  });
  it('só reconhece sucesso confirmado pelo Slack',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,ts:'123.456'})));
    await expect(slackCall('fake','chat.postMessage',{},fetcher)).resolves.toMatchObject({ts:'123.456'});
  });
});
