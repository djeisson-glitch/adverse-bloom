-- =========================================================================
-- "Ganhar orçamento → gerar job" nunca funcionou
--
-- Achado em 02/08/2026 testando a herança de código orçamento → projeto:
--   ERROR 55000: record "d" is not assigned yet
--
-- A causa é uma colisão de nomes. A função declara `d record` e a consulta
-- usa `public.deals d` — no plpgsql, o `d.id` do WHERE resolve pro RECORD
-- (ainda vazio), não pro alias da tabela. Ou seja: a função morre na
-- primeira linha, sempre. Confere com o banco: ZERO projetos com deal_id
-- preenchido, nenhum job jamais saiu por esse caminho.
--
-- `converter_orcamento_em_projeto` tem exatamente o mesmo defeito.
--
-- Duas correções, então:
--   1. renomear o record pra `dl`;
--   2. parar de gravar `sold_value` em `projects` — a coluna saiu da tabela
--      em 20260714180000, quando o dinheiro foi pra `projects_financeiro`
--      (a tabela aberta vazava valor de projeto). O valor vendido agora vai
--      pra linha lateral, que o trigger tg_projeto_financeiro já cria.
-- =========================================================================

create or replace function public.ganhar_orcamento_gerar_job(_deal_id uuid, _valor_final numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  dl          record;
  pid         uuid;
  valor       numeric;
  v_budget_id uuid;
begin
  select d.*, c.name as client_name into dl
    from public.deals d left join public.clients c on c.id = d.client_id
    where d.id = _deal_id;
  if not found then raise exception 'Deal não encontrado'; end if;

  valor := coalesce(_valor_final, dl.valor_final_aprovado, dl.value, 0);
  v_budget_id := (select id from public.budgets where deal_id = dl.id order by created_at desc limit 1);

  update public.deals set stage = 'aceite', valor_final_aprovado = valor, value = valor where id = _deal_id;

  -- Idempotência: se já há projeto pra esse orçamento, reusa em vez de duplicar.
  if v_budget_id is not null then
    select id into pid from public.projects where budget_id = v_budget_id limit 1;
  end if;

  if pid is null then
    insert into public.projects (name, client_id, client_name, status, sold_date, deal_id, budget_id)
    values (dl.title, dl.client_id, coalesce(dl.client_name, ''), 'aguardando', current_date, dl.id, v_budget_id)
    returning id into pid;

    update public.projects_financeiro
       set sold_value = valor, contract_value = valor, updated_at = now()
     where project_id = pid;
  end if;

  if v_budget_id is not null then
    perform public.popular_projeto_do_orcamento(pid, v_budget_id);
  end if;

  return pid;
end;
$$;
grant execute on function public.ganhar_orcamento_gerar_job(uuid, numeric) to authenticated;

create or replace function public.converter_orcamento_em_projeto(_deal_id uuid, _valor_final numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  dl    record;
  pid   uuid;
  valor numeric;
begin
  select d.*, c.name as client_name into dl
    from public.deals d left join public.clients c on c.id = d.client_id
    where d.id = _deal_id;
  if not found then raise exception 'Deal não encontrado'; end if;

  valor := coalesce(_valor_final, dl.valor_final_aprovado, dl.value, 0);

  update public.deals
     set stage = 'aceite', valor_final_aprovado = valor, value = valor
   where id = _deal_id;

  insert into public.projects (name, client_id, client_name, status, sold_date, deal_id, budget_id)
  values (dl.title, dl.client_id, coalesce(dl.client_name, ''), 'aguardando', current_date, dl.id,
          (select id from public.budgets where deal_id = dl.id order by created_at desc limit 1))
  returning id into pid;

  update public.projects_financeiro
     set sold_value = valor, contract_value = valor, updated_at = now()
   where project_id = pid;

  return pid;
end;
$$;
grant execute on function public.converter_orcamento_em_projeto(uuid, numeric) to authenticated;
