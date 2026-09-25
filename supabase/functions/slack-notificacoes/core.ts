export type Item = {
  id: string; user_id: string; tentativas: number; slack_target: string;
  destino: 'direta' | 'canal'; titulo: string; corpo: string | null;
  link: string | null; nivel: number; group_key: string | null;
};
export class SlackError extends Error {
  constructor(public code: string, public retryAfter = 0, public permanent = false) { super(code); }
}
const permanent = new Set(['invalid_auth','token_revoked','account_inactive','missing_scope',
  'channel_not_found','not_in_channel','is_archived','user_not_found','users_not_found','invalid_blocks']);
export async function slackCall(token: string, method: string, body: Record<string, unknown>, fetcher = fetch) {
  let response: Response;
  try {
    const read = method === 'users.info' || method === 'conversations.info';
    const url = new URL(`https://slack.com/api/${method}`);
    if (read) for (const [key,value] of Object.entries(body)) url.searchParams.set(key,String(value));
    response = await fetcher(url.href, {
      method: read ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: read ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
  } catch { throw new SlackError('rede_ou_timeout'); }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after'));
    throw new SlackError('ratelimited', Number.isFinite(seconds) && seconds > 0 ? seconds : 60);
  }
  if (!response.ok) throw new SlackError(`http_${response.status}`,0,response.status>=400 && response.status<500);
  let data;
  try { data = await response.json(); } catch { throw new SlackError('resposta_invalida'); }
  if (!data.ok) {
    const code = typeof data.error === 'string' && /^[a-z0-9_]+$/.test(data.error) ? data.error : 'erro_slack';
    throw new SlackError(code,code === 'ratelimited' ? 60 : 0,permanent.has(code));
  }
  return data;
}
export function safeLink(link: string | null, origin: string) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('APP_URL inválida');
  const fallback = new URL('/notificacoes',base).href;
  try {
    const url = new URL(link || '/notificacoes',base);
    return url.origin === base.origin && !url.username && !url.password ? url.href : fallback;
  } catch { return fallback; }
}
export function groupItems(items: Item[]) {
  const groups = new Map<string,Item[]>();
  for (const n of items) {
    const key = JSON.stringify([n.destino,n.slack_target,n.nivel,n.nivel===2 ? 'resumo' : n.group_key || n.id]);
    groups.set(key,[...(groups.get(key)||[]),n]);
  }
  return [...groups.values()];
}
export function message(items: Item[], origin: string) {
  const title = items[0].nivel===2 ? `Adverse OS · ${items.length} aviso(s) no resumo` :
    items.length===1 ? items[0].titulo : `Adverse OS · ${items.length} atualizações`;
  const lines = items.map(n => `${n.titulo}${n.corpo ? `\n${n.corpo}` : ''}`);
  return {
    text: [title,...lines,safeLink(items.length===1 ? items[0].link : '/notificacoes',origin)].join('\n\n').slice(0,3900),
    mrkdwn: false, parse: 'none', link_names: false, unfurl_links: false, unfurl_media: false,
    blocks: [
      {type:'header',text:{type:'plain_text',text:title.slice(0,150)}},
      ...items.flatMap(n => [
        {type:'section',text:{type:'plain_text',text:`${n.titulo}${n.corpo ? `\n${n.corpo}` : ''}`.slice(0,2900)}},
        {type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Abrir no Adverse OS'},url:safeLink(n.link,origin)}]},
      ]),
    ],
  };
}
