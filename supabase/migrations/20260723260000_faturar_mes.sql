-- =========================================================================
-- Rascunho do mês → FATURA (o "balde de projetos" do cliente vira uma fatura só).
--
-- Regras (definidas pelo Djêisson):
--   • Só entram projetos com faturamento = 'mensal'. Avulso fatura à parte e
--     já ficava fora da soma.
--   • Contrato NÃO fatura o valor fixo pelo sistema (isso é NF recorrente por
--     fora) — o sistema fatura apenas o EXCEDENTE da franquia, precificado por
--     valor fixo de diária/entrega extra.
--   • Um cliente + um mês = UMA fatura (o UNIQUE do rascunho já garante isso).
-- =========================================================================

-- 1) Preço do extra no contrato — sem isso não dá pra precificar o excedente.
alter table public.client_contratos
  add column if not exists valor_diaria_extra  numeric(14,2) not null default 0,
  add column if not exists valor_entrega_extra numeric(14,2) not null default 0;

-- 2) Contrato: o subtotal do rascunho passa a ser o EXCEDENTE (o que de fato
--    se fatura). O valor fixo do contrato continua visível no detalhe/consumo,
--    pra não sumir a informação — só não entra na conta da fatura.
create or replace function public.contrato_excedente(_client uuid, _ini date, _fim date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  _ctr record;
  _diarias int; _entregas int;
  _exc_diarias int; _exc_entregas int;
  _valor numeric(14,2);
begin
  select * into _ctr from public.client_contratos
   where client_id = _client and ativo order by created_at desc limit 1;
  if not found then return jsonb_build_object('valor', 0); end if;

  select count(*) into _diarias
    from public.producao_saidas s join public.projects p on p.id = s.project_id
   where p.client_id = _client and s.tipo = 'diaria' and s.status <> 'cancelada'
     and s.data >= _ini and s.data < _fim
     and coalesce(p.faturamento, 'mensal') = 'mensal';

  select count(*) into _entregas
    from public.deliverables d join public.projects p on p.id = d.project_id
   where p.client_id = _client and d.data_entrega >= _ini and d.data_entrega < _fim
     and d.status not in ('reprovado', 'cancelado')
     and coalesce(p.faturamento, 'mensal') = 'mensal';

  _exc_diarias  := greatest(0, _diarias  - coalesce(_ctr.diarias_mes, 0));
  _exc_entregas := greatest(0, _entregas - coalesce(_ctr.entregas_mes, 0));
  _valor := _exc_diarias  * coalesce(_ctr.valor_diaria_extra, 0)
          + _exc_entregas * coalesce(_ctr.valor_entrega_extra, 0);

  return jsonb_build_object(
    'valor', _valor,
    'diarias_excedentes', _exc_diarias,
    'entregas_excedentes', _exc_entregas,
    'valor_diaria_extra', coalesce(_ctr.valor_diaria_extra, 0),
    'valor_entrega_extra', coalesce(_ctr.valor_entrega_extra, 0)
  );
end;
$$;

-- 3) Rascunho → fatura. Uma fatura por cliente/mês, emitida no MÊS SEGUINTE
--    ao de referência (é quando se cobra). Idempotente: se já faturou, devolve
--    a fatura existente em vez de duplicar.
create or replace function public.faturar_mes(_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  f record;
  _cli text;
  _inv uuid;
  _emissao date;
  _exc jsonb;
  _valor numeric(14,2);
  _mg numeric(6,2); _imp numeric(6,2);
  _desc text;
begin
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'sem permissão para faturar';
  end if;

  select * into f from public.faturamento_mensal where id = _id;
  if not found then raise exception 'rascunho não encontrado'; end if;

  -- Já faturado: devolve o que existe (clicar duas vezes não duplica fatura).
  if f.invoice_id is not null then return f.invoice_id; end if;

  select name into _cli from public.clients where id = f.client_id;
  _emissao := (f.ref_mes + interval '1 month')::date;   -- cobra no mês seguinte
  _desc := coalesce(_cli, 'Cliente') || ' · ' || to_char(f.ref_mes, 'MM/YYYY');

  if f.modelo = 'contrato' then
    -- O valor fixo do contrato é faturado por fora; aqui só o excedente.
    _exc := public.contrato_excedente(f.client_id, f.ref_mes, (f.ref_mes + interval '1 month')::date);
    _valor := coalesce((_exc->>'valor')::numeric, 0);
    select margem_percent, imposto_percent into _mg, _imp
      from public.client_faturamento where client_id = f.client_id;
    -- mesma conta aditiva do rascunho: + margem, depois imposto sobre o total
    _valor := round(_valor * (1 + coalesce(_mg, 0) / 100), 2);
    _valor := round(_valor * (1 + coalesce(_imp, 0) / 100), 2);
    _desc := _desc || ' · excedente do contrato ('
          || coalesce(_exc->>'diarias_excedentes','0') || ' diária(s), '
          || coalesce(_exc->>'entregas_excedentes','0') || ' entrega(s))';
  else
    _valor := coalesce(f.total, 0);
  end if;

  if _valor <= 0 then
    raise exception 'nada a faturar neste mês%',
      case when f.modelo = 'contrato' then ' (contrato dentro da franquia)' else ' (total zerado)' end;
  end if;

  insert into public.invoices (client_id, descricao, valor, data_emissao, status, created_by)
  values (f.client_id, _desc, _valor, _emissao, 'rascunho', auth.uid())
  returning id into _inv;

  update public.faturamento_mensal
     set invoice_id = _inv, status = 'faturado'
   where id = _id;

  return _inv;
end;
$$;

grant execute on function public.contrato_excedente(uuid, date, date) to authenticated;
grant execute on function public.faturar_mes(uuid) to authenticated;
