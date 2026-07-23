-- =========================================================================
-- Log geral: tira o custo do trigger do caminho quente (autosave).
--
-- Antes: UM trigger AFTER INSERT/UPDATE/DELETE chamava a função em TODA
-- escrita — e a função serializava a linha inteira (to_jsonb de OLD e NEW)
-- só pra descobrir que nada relevante tinha mudado. Como as telas salvam
-- sozinhas enquanto se digita, isso era trabalho jogado fora a cada 800ms.
--
-- Agora: INSERT/DELETE seguem sempre; o UPDATE ganha uma cláusula WHEN na
-- coluna de estado — o Postgres avalia isso direto na tupla e só chama a
-- função quando o estado realmente muda.
-- =========================================================================

-- A função passa a entender também soft-delete (ativo true→false = removeu).
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
    if (j_old->>'status') is distinct from (j_new->>'status') then
      v_detalhe := v_detalhe || jsonb_build_object('status',
        jsonb_build_object('de', j_old->>'status', 'para', j_new->>'status'));
    end if;
    if (j_old->>'stage') is distinct from (j_new->>'stage') then
      v_detalhe := v_detalhe || jsonb_build_object('stage',
        jsonb_build_object('de', j_old->>'stage', 'para', j_new->>'stage'));
    end if;
    -- soft-delete (ex.: aviso removido do mural)
    if (j_old->>'ativo') is distinct from (j_new->>'ativo') then
      if (j_new->>'ativo') = 'false' then v_acao := 'removeu'; else v_acao := 'criou'; end if;
      v_detalhe := v_detalhe || jsonb_build_object('ativo', j_new->>'ativo');
    end if;
    if v_detalhe = '{}'::jsonb then
      return NEW;
    end if;
  end if;

  insert into public.atividades (user_id, acao, entidade, entidade_id, rotulo, detalhe)
  values (auth.uid(), v_acao, v_entidade, v_id, v_rotulo, nullif(v_detalhe, '{}'::jsonb));

  return coalesce(NEW, OLD);
end;
$$;

do $$
declare t record;
begin
  for t in
    select * from (values
      ('projects',              'projeto',      'status'),
      ('deliverables',          'entregável',   'status'),
      ('deals',                 'orçamento',    'stage'),
      ('clients',               'cliente',      null),
      ('invoices',              'fatura',       'status'),
      ('deliverable_alteracoes','alteração',    'status'),
      ('producao_saidas',       'diária/saída', 'status'),
      ('avisos',                'aviso',        'ativo')
    ) as x(tabela, nome, col)
  loop
    if to_regclass('public.' || t.tabela) is null then continue; end if;

    execute format('drop trigger if exists trg_log_atividade on public.%I', t.tabela);
    execute format('drop trigger if exists trg_log_atividade_ins_del on public.%I', t.tabela);
    execute format('drop trigger if exists trg_log_atividade_upd on public.%I', t.tabela);

    -- criação e remoção: sempre valem o registro
    execute format(
      'create trigger trg_log_atividade_ins_del after insert or delete on public.%I
         for each row execute function public.tg_log_atividade(%L)', t.tabela, t.nome);

    -- atualização: só quando a coluna de estado muda (autosave não paga nada)
    if t.col is not null and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t.tabela and column_name = t.col
    ) then
      execute format(
        'create trigger trg_log_atividade_upd after update on public.%I
           for each row when (old.%I is distinct from new.%I)
           execute function public.tg_log_atividade(%L)',
        t.tabela, t.col, t.col, t.nome);
    end if;
  end loop;
end $$;
