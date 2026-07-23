-- =========================================================================
-- Diárias de produção por projeto.
--  • projects.diarias_contratadas: quantas vieram do orçamento (saldo a agendar).
--  • As diárias REAIS são producao_saidas (tipo='diaria', project_id, com data).
--  • A conversão orçamento→projeto passa a criar entregáveis E o saldo de
--    diárias — unificada num helper chamado pelos DOIS caminhos de "ganhar".
--  • A capacidade da semana desconta as diárias (um dia cheio bloqueia a pessoa).
-- =========================================================================

alter table public.projects
  add column if not exists diarias_contratadas int not null default 0;

-- projects_v lista as colunas na mão. CREATE OR REPLACE só deixa ACRESCENTAR
-- coluna no fim (mesma ordem das existentes), então diarias_contratadas vai ao final.
create or replace view public.projects_v as
select
  p.aprovador_n1_id, p.aprovador_n2_id, p.billing_status, p.briefing_consolidado,
  p.budget_id, p.clickup_task_id, p.client_id, p.client_name, p.cliente_aprova,
  p.conta_fee_id, p.created_at, p.deal_id, p.delivery_date,
  p.edicao_horas_mapeadas, p.edicao_horas_vendidas, p.escopo_vendido, p.id, p.name,
  p.notes, p.numero, p.objetivos, p.observacoes_cliente, p.progress, p.project_type,
  p.restricoes, p.sold_date, p.start_date, p.status, p.workflow_id,
  f.sold_value, f.direct_costs, f.contract_value, f.invoiced_value,
  f.custo_hora_padrao, f.gross_margin_value, f.gross_margin_percent,
  p.diarias_contratadas
from public.projects p
left join public.projects_financeiro f on f.project_id = p.id;
alter view public.projects_v set (security_invoker = on);
grant select on public.projects_v to authenticated;

-- Helper idempotente: cria entregáveis (se ainda não há) + grava o saldo de
-- diárias contratadas. Chamável pelos dois caminhos sem duplicar entregáveis.
create or replace function public.popular_projeto_do_orcamento(p_project_id uuid, p_budget_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_budget  record;
  ent       jsonb;
  q         int;
  k         int;
  ord       int := 0;
  v_diarias int := 0;
begin
  select * into v_budget from budgets where id = p_budget_id;
  if not found then return; end if;

  -- Entregáveis: só se o projeto ainda não tiver nenhum (idempotência).
  if not exists (select 1 from deliverables where project_id = p_project_id) then
    if v_budget.entregas is not null and jsonb_typeof(v_budget.entregas) = 'array' then
      for ent in select value from jsonb_array_elements(v_budget.entregas) loop
        q := greatest(coalesce(nullif(ent->>'quantidade', '')::int, 1), 1);
        for k in 1..q loop
          ord := ord + 1;
          insert into deliverables (project_id, titulo, formato, duracao, status, ordem)
          values (
            p_project_id,
            coalesce(nullif(btrim(ent->>'titulo'), ''), 'Entrega')
              || case when q > 1 then ' (' || k || '/' || q || ')' else '' end,
            nullif(btrim(ent->>'formato'), ''),
            nullif(btrim(ent->>'duracao'), ''),
            'pendente', ord
          );
        end loop;
      end loop;
    end if;
  end if;

  -- Diárias contratadas: soma de entregas[].diarias; se zero, usa capture_days.
  if v_budget.entregas is not null and jsonb_typeof(v_budget.entregas) = 'array' then
    select coalesce(sum(greatest(coalesce(nullif(e->>'diarias', '')::int, 0), 0)), 0)
      into v_diarias
      from jsonb_array_elements(v_budget.entregas) e;
  end if;
  if v_diarias = 0 then
    v_diarias := coalesce(v_budget.capture_days, 0);
  end if;

  update projects set diarias_contratadas = v_diarias where id = p_project_id;
end;
$$;
grant execute on function public.popular_projeto_do_orcamento(uuid, uuid) to authenticated;

-- create_project_from_budget: usa o helper (entregáveis + diárias) no lugar do
-- loop inline. Mesmo comportamento de antes + o saldo de diárias.
create or replace function public.create_project_from_budget(p_budget_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_budget  record;
  v_proj_id uuid;
  v_nome    text;
begin
  select b.*, c.name as client_display_name into v_budget
    from budgets b left join clients c on c.id = b.client_id
   where b.id = p_budget_id;
  if not found then raise exception 'Orçamento % não encontrado', p_budget_id; end if;

  select id into v_proj_id from projects where budget_id = p_budget_id limit 1;
  if found then return v_proj_id; end if;

  v_nome := regexp_replace(coalesce(nullif(btrim(v_budget.project_name), ''), 'Projeto'),
                           '^(#[0-9]+_|\[[0-9A-Za-z-]+\]_)', '');
  if v_budget.budget_number is not null then
    v_nome := '[' || lpad(v_budget.budget_number::text, 4, '0') || ']_' || v_nome;
  end if;

  insert into projects (name, client_id, client_name, status, sold_date, deal_id, budget_id)
  values (v_nome, v_budget.client_id,
          coalesce(v_budget.client_name, v_budget.client_display_name, 'Cliente'),
          'briefing', current_date, v_budget.deal_id, v_budget.id)
  returning id into v_proj_id;

  update projects_financeiro
     set sold_value = v_budget.total_value, contract_value = v_budget.total_value, updated_at = now()
   where project_id = v_proj_id;

  update project_costs set project_id = v_proj_id
   where budget_id = p_budget_id and project_id is null;

  perform public.popular_projeto_do_orcamento(v_proj_id, p_budget_id);

  if v_budget.deal_id is not null then
    update deals set stage = 'fechado_ganho', updated_at = now()
     where id = v_budget.deal_id and stage not in ('fechado_ganho', 'perdido');
  end if;

  return v_proj_id;
end;
$$;
grant execute on function public.create_project_from_budget(uuid) to authenticated;

-- ganhar_orcamento_gerar_job: agora também cria entregáveis + saldo de diárias
-- (antes só criava o projeto), e vira idempotente por orçamento.
create or replace function public.ganhar_orcamento_gerar_job(_deal_id uuid, _valor_final numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  d           record;
  pid         uuid;
  valor       numeric;
  v_budget_id uuid;
begin
  select d.*, c.name as client_name into d
    from public.deals d left join public.clients c on c.id = d.client_id
    where d.id = _deal_id;
  if not found then raise exception 'Deal não encontrado'; end if;

  valor := coalesce(_valor_final, d.valor_final_aprovado, d.value, 0);
  v_budget_id := (select id from public.budgets where deal_id = d.id order by created_at desc limit 1);

  update public.deals set stage = 'aceite', valor_final_aprovado = valor, value = valor where id = _deal_id;

  -- Idempotência: se já há projeto pra esse orçamento, reusa em vez de duplicar.
  if v_budget_id is not null then
    select id into pid from public.projects where budget_id = v_budget_id limit 1;
  end if;

  if pid is null then
    insert into public.projects (name, client_id, client_name, sold_value, status, sold_date, deal_id, budget_id)
    values (d.title, d.client_id, coalesce(d.client_name, ''), valor, 'aguardando', current_date, d.id, v_budget_id)
    returning id into pid;
  end if;

  if v_budget_id is not null then
    perform public.popular_projeto_do_orcamento(pid, v_budget_id);
  end if;

  return pid;
end;
$$;
grant execute on function public.ganhar_orcamento_gerar_job(uuid, numeric) to authenticated;

-- Capacidade da semana: desconta as diárias. Cada diária = um dia cheio
-- (capacidade/5) da equipe escalada (responsável + equipe), mapeando
-- team_members → profiles pelo user_id.
create or replace view public.v_capacidade_semana as
with ref as (
  select date_trunc('week', current_date)::date as ini_semana
), horas_semana as (
  select te.user_id,
    sum(te.duration_min) / 60.0 as horas_apontadas,
    sum(case when te.billable then te.duration_min else 0 end) / 60.0 as horas_faturaveis
  from public.time_entries te, ref
  where te.start_at >= ref.ini_semana
    and te.start_at <  ref.ini_semana + interval '7 days'
  group by te.user_id
), diarias as (
  select tm.user_id, count(distinct ps.data) as dias
  from public.producao_saidas ps
  join public.team_members tm on (tm.id = ps.responsavel_id or tm.id = any(ps.equipe))
  cross join ref
  where ps.tipo = 'diaria'
    and ps.status <> 'cancelada'
    and ps.data >= ref.ini_semana
    and ps.data <  ref.ini_semana + interval '7 days'
    and tm.user_id is not null
  group by tm.user_id
)
-- ocupacao_percent mantém a posição original (CREATE OR REPLACE exige mesma
-- ordem das colunas existentes); horas_diarias é acrescentada no fim.
select
  p.id                              as user_id,
  p.full_name,
  p.email,
  coalesce(p.horas_semana, 40)      as capacidade,
  coalesce(hs.horas_apontadas, 0)   as horas_apontadas,
  coalesce(hs.horas_faturaveis, 0)  as horas_faturaveis,
  case
    when coalesce(p.horas_semana, 40) > 0
      then ((coalesce(hs.horas_faturaveis, 0)
             + least(coalesce(d.dias, 0) * (coalesce(p.horas_semana, 40) / 5.0),
                     coalesce(p.horas_semana, 40)))
            / p.horas_semana * 100)
    else 0
  end                               as ocupacao_percent,
  least(coalesce(d.dias, 0) * (coalesce(p.horas_semana, 40) / 5.0),
        coalesce(p.horas_semana, 40)) as horas_diarias
from public.profiles p
left join horas_semana hs on hs.user_id = p.id
left join diarias d       on d.user_id = p.id
where p.ativo is distinct from false;
