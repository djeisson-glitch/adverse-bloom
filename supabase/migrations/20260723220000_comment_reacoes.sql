-- =========================================================================
-- Reações com emoji nas mensagens do chat (tipo Slack).
-- Uma pessoa só reage uma vez com cada emoji na mesma mensagem (unique).
-- Sem trigger de auditoria aqui de propósito: reação é ruído no log geral.
-- =========================================================================

create table if not exists public.comment_reacoes (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id, emoji)
);
create index if not exists comment_reacoes_comment_idx on public.comment_reacoes (comment_id);

alter table public.comment_reacoes enable row level security;

-- Todo mundo logado vê as reações (é conversa do time).
drop policy if exists comment_reacoes_select on public.comment_reacoes;
create policy comment_reacoes_select on public.comment_reacoes
  for select to authenticated using (true);

-- Cada um reage por si — e só tira a própria reação.
drop policy if exists comment_reacoes_insert on public.comment_reacoes;
create policy comment_reacoes_insert on public.comment_reacoes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists comment_reacoes_delete on public.comment_reacoes;
create policy comment_reacoes_delete on public.comment_reacoes
  for delete to authenticated using (user_id = auth.uid());
