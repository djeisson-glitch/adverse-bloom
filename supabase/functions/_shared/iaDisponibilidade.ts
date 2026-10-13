/** Pausa global: falha fechada; só reativar após autorização. */
export function respostaIADesativada(req: Request): Response | null {
  if (Deno.env.get('ADVERSE_AI_ENABLED') === 'true') return null;
  const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
  if(req.method === 'OPTIONS') return new Response('ok',{headers});
  return new Response(JSON.stringify({error:'Os recursos de IA estão desativados por enquanto.',code:'AI_DISABLED'}),{status:503,headers});
}
