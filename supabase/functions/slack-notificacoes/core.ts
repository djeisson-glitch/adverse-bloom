export type Item = {
  id: string; user_id: string; tentativas: number; slack_target: string;
  destino: 'direta' | 'canal'; titulo: string; corpo: string | null;
  link: string | null; nivel: number; group_key: string | null;
  tipo: string; grupo: string | null;
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

/** Texto do sistema dentro de um bloco mrkdwn. Escapar `<` e `&` é o que
 * impede um título com `<!channel>` ou `<@U…>` de virar menção de verdade. */
export const escapar = (texto: string) =>
  texto.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const EMOJI: Record<string,string> = {
  prazo_atrasado:'🔴', prazo_hoje:'⏰', prazo_amanha:'📅',
  alteracao_solicitada:'✏️', ajuste_solicitado:'✏️', ajuste_interno:'↩️',
  cliente_aprovou:'✅', aguardando_aprovacao:'👀', entregavel_aprovado:'🎉',
  entregavel_atribuido:'🎬', tarefa_atribuida:'📋',
  mencao:'💬', mensagem:'💬',
  carta_aprovada:'🎉', lead_toque:'🔥', demanda_nova:'📥', briefing_enviado:'📝',
  digest:'☀️', teste:'🧪', teste_entrega:'🧪',
};
const ROTULO_GRUPO: Record<string,string> = {
  prazos:'Prazos', producao:'Produção', conversas:'Conversas',
  comercial:'Comercial', sistema:'Adverse OS',
};
export const emojiDe = (tipo: string) => EMOJI[tipo] ?? '•';

/** Prazo e nível 2 viram UMA mensagem por destino: os mesmos itens vencidos
 * são reanunciados todo dia, e um aviso por item enterra o que pede ação. O
 * resto (alteração do cliente, menção) continua uma mensagem cada. */
const juntaTudo = (n: Item) => n.grupo === 'prazos' || n.nivel === 2;

export function groupItems(items: Item[]) {
  const groups = new Map<string,Item[]>();
  for (const n of items) {
    const key = JSON.stringify([n.destino,n.slack_target,
      juntaTudo(n) ? `resumo:${n.grupo ?? n.tipo}` : n.group_key || n.id]);
    groups.set(key,[...(groups.get(key)||[]),n]);
  }
  return [...groups.values()];
}

const LINHAS_VISIVEIS = 15;

export function message(items: Item[], origin: string) {
  if (items.length === 1) {
    const n = items[0];
    const texto = `*${emojiDe(n.tipo)} ${escapar(n.titulo)}*${n.corpo ? `\n${escapar(n.corpo)}` : ''}`;
    return {
      text: [n.titulo,n.corpo,safeLink(n.link,origin)].filter(Boolean).join('\n').slice(0,3900),
      mrkdwn: false, parse: 'none', link_names: false, unfurl_links: false, unfurl_media: false,
      blocks: [
        {type:'section',text:{type:'mrkdwn',text:texto.slice(0,2900)}},
        {type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Abrir no Adverse OS'},url:safeLink(n.link,origin)}]},
      ],
    };
  }
  const titulo = `${ROTULO_GRUPO[items[0].grupo ?? ''] ?? 'Adverse OS'} · ${items.length}`;
  const visiveis = items.slice(0,LINHAS_VISIVEIS);
  const resto = items.length - visiveis.length;
  // Uma linha por item, clicável: o corpo ("PÓS | peça · [0353] projeto") diz
  // qual é o item; o emoji diz o que aconteceu.
  const linhas = visiveis.map(n =>
    `${emojiDe(n.tipo)} <${safeLink(n.link,origin)}|${escapar((n.corpo || n.titulo).slice(0,90))}>`);
  if (resto > 0) linhas.push(`_+${resto} …_`);
  return {
    text: [titulo,...visiveis.map(n => `${n.titulo}: ${n.corpo ?? ''}`),safeLink('/notificacoes',origin)].join('\n').slice(0,3900),
    mrkdwn: false, parse: 'none', link_names: false, unfurl_links: false, unfurl_media: false,
    blocks: [
      {type:'header',text:{type:'plain_text',text:titulo.slice(0,150)}},
      {type:'section',text:{type:'mrkdwn',text:linhas.join('\n').slice(0,2900)}},
      {type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Ver no Adverse OS'},url:safeLink('/notificacoes',origin)}]},
    ],
  };
}

/** Cartão do /advr: o item chamado na conversa, com um clique pro sistema. */
export function cartaoItem(item: {
  codigo: string; titulo: string; status: string | null; projeto: string | null;
  responsavel: string | null; prazo: string | null; link: string;
}, origin: string) {
  const campos = [
    item.projeto && `*Projeto:* ${escapar(item.projeto)}`,
    item.status && `*Status:* ${escapar(item.status)}`,
    item.responsavel && `*Responsável:* ${escapar(item.responsavel)}`,
    item.prazo && `*Prazo:* ${escapar(item.prazo)}`,
  ].filter(Boolean).join('  ·  ');
  return {
    response_type: 'in_channel',
    text: `${item.codigo} — ${item.titulo}`,
    mrkdwn: false, unfurl_links: false, unfurl_media: false,
    blocks: [
      {type:'section',text:{type:'mrkdwn',text:`*🎬 ${escapar(item.codigo)} · ${escapar(item.titulo)}*${campos ? `\n${campos}` : ''}`.slice(0,2900)}},
      {type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Abrir no Adverse OS'},url:safeLink(item.link,origin)}]},
    ],
  };
}
