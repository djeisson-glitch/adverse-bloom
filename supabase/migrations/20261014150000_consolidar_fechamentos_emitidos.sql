-- Também consolidar o controle dos meses emitidos, sem reescrever as notas/referências originais.
BEGIN;
CREATE FUNCTION public.consolidar_orcamento_emitido(_f public.faturamento_mensal)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.budgets%ROWTYPE; mes date:=date_trunc('month',_f.ref_mes)::date; cliente text; x record;
BEGIN
 IF _f.detalhe ? 'orcamento_mensal' THEN RETURN _f.detalhe->'orcamento_mensal'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_f.client_id::text||mes::text,1));
 SELECT * INTO b FROM public.budgets WHERE client_id=_f.client_id AND fechamento_mes=mes FOR UPDATE;
 IF b.id IS NULL THEN
   SELECT name INTO cliente FROM public.clients WHERE id=_f.client_id;
   INSERT INTO public.budgets(client_id,client_name,project_name,fechamento_mes,status,
     markup_percent,tax_percent,bv_percent,commission_percent,margem_produtora_percent,imposto_percent,total_value,proposta,notas)
   VALUES(_f.client_id,cliente,'Fechamento '||to_char(mes,'MM/YYYY')||' · '||cliente,mes,'draft',
     0,0,0,0,0,0,coalesce(_f.total,0),jsonb_build_object('faturamento','mensal','referencia_fechamento',true),
     'Consolidação gerencial de fechamento já emitido. As referências e os valores da fatura original permanecem preservados.') RETURNING * INTO b;
 END IF;
 -- Somente os projetos do snapshot original; não buscar movimentos atuais nem regerar o mês.
 FOR x IN
   SELECT DISTINCT ON (p.id) p.id,coalesce(r->>'projeto',p.name) AS nome
   FROM jsonb_array_elements(coalesce(_f.detalhe->'orcamentos_projetos','[]'::jsonb)) r
   JOIN public.projects p ON p.id=(r->>'project_id')::uuid
   WHERE r->'baldes' ? 'mensal'
   ORDER BY p.id,r->>'projeto'
 LOOP
   INSERT INTO public.orcamento_mensal_projetos(budget_id,project_id,projeto)
   VALUES(b.id,x.id,x.nome) ON CONFLICT(budget_id,project_id) DO NOTHING;
 END LOOP;
 RETURN jsonb_build_object('budget_id',b.id,'orcamento_numero',b.budget_number,'ref_mes',mes,'total',b.total_value,'historico',true);
END $$;
REVOKE ALL ON FUNCTION public.consolidar_orcamento_emitido(public.faturamento_mensal) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tg_fechamento_orcamentos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.budgets%ROWTYPE; refs jsonb; x jsonb; cliente text; mes date:=date_trunc('month',NEW.ref_mes)::date;
BEGIN
 -- Documentos já emitidos conservam todas as referências e valores originais.
 IF TG_OP='UPDATE' AND (OLD.referencias_emitidas OR OLD.status IN ('enviado','faturado') OR OLD.invoice_id IS NOT NULL) THEN
   NEW.referencias_emitidas:=true;
   NEW.detalhe:=coalesce(NEW.detalhe,'{}'::jsonb)-'orcamento_mensal'-'orcamentos_projetos';
   IF OLD.detalhe ? 'orcamentos_projetos' THEN
     NEW.detalhe:=NEW.detalhe||jsonb_build_object('orcamentos_projetos',OLD.detalhe->'orcamentos_projetos');
   END IF;
   NEW.detalhe:=NEW.detalhe||jsonb_build_object('orcamento_mensal',public.consolidar_orcamento_emitido(OLD));
   RETURN NEW;
 END IF;
 NEW.referencias_emitidas:=NEW.status IN ('enviado','faturado') OR NEW.invoice_id IS NOT NULL;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text||mes::text,1));
 SELECT * INTO b FROM public.budgets WHERE client_id=NEW.client_id AND fechamento_mes=mes FOR UPDATE;
 IF b.id IS NULL THEN
   SELECT name INTO cliente FROM public.clients WHERE id=NEW.client_id;
   INSERT INTO public.budgets(client_id,client_name,project_name,fechamento_mes,status,
     markup_percent,tax_percent,bv_percent,commission_percent,margem_produtora_percent,imposto_percent,total_value,proposta,notas)
   VALUES(NEW.client_id,cliente,'Fechamento '||to_char(mes,'MM/YYYY')||' · '||cliente,mes,'draft',
     0,0,0,0,0,0,coalesce(NEW.total,0),jsonb_build_object('faturamento','mensal','referencia_fechamento',true),
     'Orçamento único da competência. Total calculado no fechamento; divisão por projeto é gerencial, sem cobrança adicional.') RETURNING * INTO b;
 END IF;
 refs:=public.orcamentos_do_periodo(NEW.client_id,mes);
 UPDATE public.orcamento_mensal_projetos SET ativo=false WHERE budget_id=b.id;
 FOR x IN SELECT value FROM jsonb_array_elements(refs) WHERE value->>'mensal'='true' LOOP
   INSERT INTO public.orcamento_mensal_projetos(budget_id,project_id,projeto) VALUES(b.id,(x->>'project_id')::uuid,x->>'projeto')
   ON CONFLICT(budget_id,project_id) DO UPDATE SET ativo=true,projeto=excluded.projeto;
 END LOOP;
 -- Receita/custos manuais sobrevivem à regeneração; a revisão impede salvar uma tela desatualizada.
 UPDATE public.budgets SET total_value=coalesce(NEW.total,0),fechamento_revisao=fechamento_revisao+1 WHERE id=b.id;
 NEW.detalhe:=coalesce(NEW.detalhe,'{}'::jsonb)||jsonb_build_object('orcamentos_projetos',refs,
   'orcamento_mensal',jsonb_build_object('budget_id',b.id,'orcamento_numero',b.budget_number,'ref_mes',mes,'total',coalesce(NEW.total,0)));
 RETURN NEW;
END $$;

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
  _refs text;
begin
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'sem permissão para faturar';
  end if;

  select * into f from public.faturamento_mensal where id = _id FOR UPDATE;
  if not found then raise exception 'rascunho não encontrado'; end if;

  -- Já faturado: devolve o que existe (clicar duas vezes não duplica fatura).
  if f.invoice_id is not null then return f.invoice_id; end if;

  PERFORM public.preparar_orcamentos_fechamento(_id);
  SELECT * INTO f FROM public.faturamento_mensal WHERE id=_id;
  SELECT string_agg('#'||lpad(n::text,greatest(4,length(n::text)),'0'),', ' ORDER BY n) INTO _refs
  FROM (SELECT DISTINCT (x->>'orcamento_numero')::int AS n
    FROM jsonb_array_elements(f.detalhe->'orcamentos_projetos') x
    WHERE x->'baldes' ? 'mensal') q;

  IF f.detalhe ? 'orcamento_mensal' AND NOT coalesce((f.detalhe->'orcamento_mensal'->>'historico')::boolean,false) THEN
    _refs:='#'||lpad(f.detalhe->'orcamento_mensal'->>'orcamento_numero',greatest(4,length(f.detalhe->'orcamento_mensal'->>'orcamento_numero')),'0');
  END IF;

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

  IF _refs IS NOT NULL THEN _desc:=_desc || CASE WHEN f.detalhe ? 'orcamento_mensal' AND NOT coalesce((f.detalhe->'orcamento_mensal'->>'historico')::boolean,false) THEN ' · Orçamento: ' ELSE ' · Orçamentos: ' END || _refs; END IF;

  insert into public.invoices (client_id, descricao, valor, data_emissao, status, created_by)
  values (f.client_id, _desc, _valor, _emissao, 'rascunho', auth.uid())
  returning id into _inv;

  update public.faturamento_mensal
     set invoice_id = _inv, status = 'faturado'
   where id = _id;

  return _inv;
end;
$$;



UPDATE public.faturamento_mensal SET detalhe=coalesce(detalhe,'{}'::jsonb)
 WHERE (referencias_emitidas OR status IN ('enviado','faturado') OR invoice_id IS NOT NULL)
   AND NOT (coalesce(detalhe,'{}'::jsonb) ? 'orcamento_mensal');
COMMIT;
