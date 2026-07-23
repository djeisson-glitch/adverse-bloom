-- =========================================================================
-- Log geral (auditoria) — "tudo que foi feito no sistema".
-- Um trigger genérico registra criação, remoção e mudança de status/etapa das
-- entidades-chave. NÃO registra cada edição de campo (autosave) pra não virar
-- ruído — só os eventos que importam pro histórico.
-- =========================================================================

create table if not exists public.atividades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,                 -- quem fez (auth.uid()); null = sistema/portal/cron
  acao        text not null,        -- 'criou' | 'atualizou' | 'removeu'
  entidade    text not null,        -- 'projeto' | 'entregável' | 'orçamento' | ...
  entidade_id uuid,
  rotulo      text,                 -- nome/título legível da coisa
  detalhe     jsonb,                -- ex.: {"status":{"de":"x","para":"y"}}
  created_at  timestamptz not null default now()
);
create index if not exists atividades_recentes_idx on public.atividades (created_at desc);
create index if not exists atividades_entidade_idx on public.atividades (entidade, entidade_id);

alter table public.atividades enable row level security;

-- Só a gestão lê o log (admin, produtor, coordenadora).
create or replace function public.pode_ver_log(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_uid,'admin') or public.has_role(_uid,'manager')
      or public.has_role(_uid,'produtor') or public.has_role(_uid,'coordenadora')
$$;

drop policy if exists atividades_select on public.atividades;
create policy atividades_select on public.atividades
  for select to authenticated using (public.pode_ver_log(auth.uid()));
-- Sem policy de INSERT: só entra via trigger (SECURITY DEFINER).

-- Trigger genérico. O nome amigável da entidade vem como argumento do trigger.
create or replace function public.tg_log_atividade()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  j_new     jsonb := case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end;
  j_old     jsonb := case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end;
  v_entidade text := TG_ARGV[0];
  v_rotulo  text;
  v_id      uuid;
  v_acao    text;
  v_detalhe jsonb := '{}'::jsonb;
begin
  v_rotulo := coalesce(j_new->>'name', j_new->>'titulo', j_new->>'title',
                       j_old->>'name', j_old->>'titulo', j_old->>'title');
  v_id := coalesce(j_new->>'id', j_old->>'id')::uuid;

  if TG_OP = 'INSERT' then
    v_acao := 'criou';
  elsif TG_OP = 'DELETE' then
    v_acao := 'removeu';
  else
    v_acao := 'atualizou';
    -- só registra update se mudou status ou stage (o que importa no histórico)
    if (j_old->>'status') is distinct from (j_new->>'status') then
      v_detalhe := v_detalhe || jsonb_build_object('status',
        jsonb_build_object('de', j_old->>'status', 'para', j_new->>'status'));
    end if;
    if (j_old->>'stage') is distinct from (j_new->>'stage') then
      v_detalhe := v_detalhe || jsonb_build_object('stage',
        jsonb_build_object('de', j_old->>'stage', 'para', j_new->>'stage'));
    end if;
    if v_detalhe = '{}'::jsonb then
      return NEW;   -- nada notável mudou → não polui o log
    end if;
  end if;

  insert into public.atividades (user_id, acao, entidade, entidade_id, rotulo, detalhe)
  values (auth.uid(), v_acao, v_entidade, v_id, v_rotulo, nullif(v_detalhe, '{}'::jsonb));

  return coalesce(NEW, OLD);
end;
$$;

-- Liga o trigger nas entidades-chave (nome amigável no argumento).
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('projects',              'projeto'),
      ('deliverables',          'entregável'),
      ('deals',                 'orçamento'),
      ('clients',               'cliente'),
      ('invoices',              'fatura'),
      ('deliverable_alteracoes','alteração'),
      ('producao_saidas',       'diária/saída'),
      ('avisos',                'aviso')
    ) as x(tabela, nome)
  loop
    if to_regclass('public.' || t.tabela) is not null then
      execute format('drop trigger if exists trg_log_atividade on public.%I', t.tabela);
      execute format(
        'create trigger trg_log_atividade after insert or update or delete on public.%I
           for each row execute function public.tg_log_atividade(%L)',
        t.tabela, t.nome);
    end if;
  end loop;
end $$;
