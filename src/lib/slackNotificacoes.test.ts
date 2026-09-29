import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { cartaoItem, groupItems, message, safeLink, slackCall, type Item } from '../../supabase/functions/slack-notificacoes/core';
// jsdom 20 lacks AbortSignal.timeout; requests are mocked in these tests.
beforeAll(()=>vi.stubGlobal('AbortSignal',{timeout:()=>new AbortController().signal}));
afterAll(()=>vi.unstubAllGlobals());
const item = (patch:Partial<Item>={}):Item => ({id:'1',user_id:'p1',tentativas:1,slack_target:'U12345678',destino:'direta',titulo:'Revisar vídeo',corpo:'Cliente pediu ajuste',link:'/projetos/1',nivel:1,group_key:'ajuste:1',tipo:'ajuste_solicitado',grupo:'producao',...patch});
const prazo = (patch:Partial<Item>={}):Item => item({tipo:'prazo_atrasado',grupo:'prazos',nivel:1,titulo:'Atrasado',...patch});
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
    const texto=JSON.stringify(payload.blocks);
    expect(texto).not.toContain('<!channel>');
    expect(texto).not.toContain('<@U12345678>');
    expect(texto).toContain('&lt;!channel&gt;');
    expect(payload.blocks[1]).toMatchObject({elements:[{url:'https://app.test/projetos/1'}]});
  });
  it('junta os prazos do mesmo destino numa mensagem só, uma linha clicável por item',()=>{
    const itens=Array.from({length:14},(_,i)=>prazo({id:String(i),group_key:`prazo_atrasado:proj${i}`,corpo:`PÓS | Peça ${i} · [035${i}] Projeto`,link:`/projetos/${i}`}));
    expect(groupItems(itens)).toHaveLength(1);
    const payload=message(itens,'https://app.test');
    expect(payload.blocks[0]).toMatchObject({type:'header',text:{text:'Prazos · 14'}});
    expect(payload.blocks[1].text.text).toContain('🔴 <https://app.test/projetos/3|PÓS | Peça 3');
    expect(payload.blocks).toHaveLength(3);   // cabeçalho + lista + botão
  });
  it('acima de 15 itens diz quantos ficaram de fora, sem perder o limite de texto',()=>{
    const payload=message(Array.from({length:40},(_,i)=>prazo({id:String(i),corpo:'x'.repeat(200)})),'https://app.test');
    expect(payload.blocks[1].text.text).toContain('+25');
    expect(payload.blocks[1].text.text.length).toBeLessThan(3000);
  });
  it('cartão do /advr leva o código, os campos e o botão pro sistema',()=>{
    const cartao=cartaoItem({codigo:'ADVR-4448',titulo:'Reels Olimpíadas',status:'Em edição',projeto:'[0355] Olimpíadas',responsavel:'Maiara',prazo:'02/10',link:'/entregaveis/abc'},'https://app.test');
    expect(cartao.response_type).toBe('in_channel');
    expect(cartao.blocks[0].text.text).toContain('ADVR-4448');
    expect(cartao.blocks[0].text.text).toContain('*Responsável:* Maiara');
    expect(cartao.blocks[1]).toMatchObject({elements:[{url:'https://app.test/entregaveis/abc'}]});
  });
  it('resumo respeita os limites de texto do Slack',()=>{
    const payload=message(Array.from({length:10},(_,i)=>item({id:String(i),nivel:2,corpo:'x'.repeat(10000)})),'https://app.test');
    expect(payload.blocks).toHaveLength(3);
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
