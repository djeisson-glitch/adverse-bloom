-- Referência financeira permanente por projeto, sem alterar a cobrança do mês.
BEGIN;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS origem_projeto_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS budgets_origem_projeto_unico ON public.budgets(origem_projeto_id) WHERE origem_projeto_id IS NOT NULL;

-- Interna: somente triggers e RPCs autorizadas podem criar/vincular o orçamento.
CREATE OR REPLACE FUNCTION public.garantir_orcamento_projeto_interno(_project uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.projects%ROWTYPE; b public.budgets%ROWTYPE; cfg jsonb; cliente text; n int; candidatos int;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id=_project FOR UPDATE;
  IF NOT FOUND OR p.client_id IS NULL THEN RETURN NULL; END IF;
  SELECT name INTO cliente FROM public.clients WHERE id=p.client_id;
  IF p.budget_id IS NOT NULL THEN
    SELECT * INTO b FROM public.budgets WHERE id=p.budget_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento vinculado não encontrado'; END IF;
    IF b.client_id IS NOT NULL AND b.client_id <> p.client_id THEN RAISE EXCEPTION 'Orçamento pertence a outro cliente: %',p.name; END IF;
  ELSE
    SELECT * INTO b FROM public.budgets WHERE origem_projeto_id=p.id;
    IF NOT FOUND AND p.deal_id IS NOT NULL THEN
      -- Nunca escolher uma alternativa arbitrariamente. Uma raiz inequívoca é reutilizada.
      PERFORM pg_advisory_xact_lock(hashtextextended(p.deal_id::text,0));
      SELECT count(*) INTO candidatos FROM public.budgets
       WHERE deal_id=p.deal_id AND parent_budget_id IS NULL AND is_latest_version;
      IF candidatos>1 THEN RAISE EXCEPTION 'Escolha o orçamento deste projeto antes de fechar: %',p.name; END IF;
      SELECT * INTO b FROM public.budgets WHERE deal_id=p.deal_id AND parent_budget_id IS NULL AND is_latest_version LIMIT 1 FOR UPDATE;
      IF b.id IS NULL AND EXISTS (SELECT 1 FROM public.budgets WHERE deal_id=p.deal_id) THEN RAISE EXCEPTION 'Vincule a versão do orçamento deste projeto antes de fechar: %',p.name; END IF;
      IF b.client_id IS NOT NULL AND b.client_id<>p.client_id THEN RAISE EXCEPTION 'Orçamento pertence a outro cliente: %',p.name; END IF;
    END IF;
    IF b.id IS NULL THEN
      SELECT to_jsonb(c) INTO cfg FROM public.client_faturamento c WHERE client_id=p.client_id;
      INSERT INTO public.budgets (project_name,client_name,client_id,deal_id,origem_projeto_id,status,
        markup_percent,tax_percent,bv_percent,commission_percent,margem_produtora_percent,imposto_percent,
        total_value,proposta,notas)
      VALUES (p.name,coalesce(cliente,''),p.client_id,p.deal_id,p.id,'draft',0,0,0,0,0,0,0,
        jsonb_build_object('faturamento',coalesce(p.faturamento,'mensal'),'referencia_fechamento',true,
          'modelo_cobranca',coalesce(cfg->>'modelo','nenhum'),'configuracao_cliente',coalesce(cfg,'{}'::jsonb)),
        'Referência automática do projeto para o fechamento. Valor a apurar conforme a configuração de faturamento do cliente. Não representa proposta aprovada nem cobrança adicional.')
      RETURNING * INTO b;
    END IF;
    UPDATE public.projects SET budget_id=b.id WHERE id=p.id;
  END IF;
  IF b.budget_number IS NULL THEN
    -- Mesma sequência dos orçamentos existentes. Não renumera documentos nem usa o código do projeto como se fosse orçamento.
    LOOP
      n:=nextval('public.budget_number_seq')::int;
      EXIT WHEN NOT EXISTS(SELECT 1 FROM public.budgets WHERE budget_number=n);
    END LOOP;
    UPDATE public.budgets SET budget_number=n WHERE id=b.id;
  END IF;
  RETURN b.id;
END $$;
REVOKE ALL ON FUNCTION public.garantir_orcamento_projeto_interno(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tg_projeto_garante_orcamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND NEW.budget_id IS NULL THEN
    PERFORM public.garantir_orcamento_projeto_interno(NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_projeto_garante_orcamento AFTER INSERT OR UPDATE OF client_id,budget_id ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.tg_projeto_garante_orcamento();

-- Mesma régua do fechamento: peça e horas seguem criação efetiva; diária segue a data de captação.
-- Inclui os três baldes, inclusive projetos antigos com uma diária neste mês.
CREATE OR REPLACE FUNCTION public.orcamentos_do_periodo(_client uuid,_mes date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ini date:=date_trunc('month',_mes)::date; fim date:=(date_trunc('month',_mes)+interval '1 month')::date;
  x record; b public.budgets%ROWTYPE; resultado jsonb:='[]'::jsonb;
BEGIN
  FOR x IN
    WITH movimentos AS (
      SELECT p.id,coalesce(df.faturamento_efetivo,p.faturamento,'mensal') AS balde
      FROM public.projects p JOIN public.deliverables d ON d.project_id=p.id
      JOIN public.deliverables_criacao dc ON dc.id=d.id
      JOIN public.deliverables_faturamento df ON df.id=d.id
      WHERE p.client_id=_client AND dc.criacao_efetiva>=ini AND dc.criacao_efetiva<fim AND d.status NOT IN ('cancelado','reprovado')
      UNION
      SELECT p.id,coalesce(df.faturamento_efetivo,p.faturamento,'mensal')
      FROM public.projects p JOIN public.time_entries t ON t.project_id=p.id
      LEFT JOIN public.deliverables_criacao dc ON dc.id=t.deliverable_id
      LEFT JOIN public.deliverables_faturamento df ON df.id=t.deliverable_id
      WHERE p.client_id=_client AND t.billable AND coalesce(dc.criacao_efetiva,p.criado_em,p.created_at)>=ini
        AND coalesce(dc.criacao_efetiva,p.criado_em,p.created_at)<fim
      UNION
      SELECT p.id,coalesce(p.faturamento,'mensal') FROM public.projects p JOIN public.producao_saidas s ON s.project_id=p.id
      WHERE p.client_id=_client AND s.tipo='diaria' AND s.status<>'cancelada' AND s.data>=ini AND s.data<fim
      UNION
      SELECT p.id,coalesce(p.faturamento,'mensal') FROM public.projects p
      WHERE p.client_id=_client AND p.valor_fechamento IS NOT NULL AND coalesce(p.criado_em,p.created_at)>=ini AND coalesce(p.criado_em,p.created_at)<fim
    )
    SELECT p.id,p.name,jsonb_agg(DISTINCT m.balde ORDER BY m.balde) AS baldes
    FROM movimentos m JOIN public.projects p ON p.id=m.id GROUP BY p.id,p.name ORDER BY p.id
  LOOP
    SELECT * INTO b FROM public.budgets WHERE id=public.garantir_orcamento_projeto_interno(x.id);
    IF b.budget_number IS NULL THEN RAISE EXCEPTION 'Projeto sem número de orçamento: %',x.name; END IF;
    resultado:=resultado||jsonb_build_array(jsonb_build_object('project_id',x.id,'projeto',x.name,
      'budget_id',b.id,'deal_id',b.deal_id,'orcamento_numero',b.budget_number,'baldes',x.baldes));
  END LOOP;
  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.orcamentos_do_periodo(uuid,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tg_fechamento_orcamentos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- Snapshot da emissão: alterações posteriores no projeto não trocam a referência da nota.
  IF TG_OP='UPDATE' AND OLD.status IN ('enviado','faturado') AND OLD.detalhe ? 'orcamentos_projetos' THEN
    NEW.detalhe:=jsonb_set(coalesce(NEW.detalhe,'{}'::jsonb),'{orcamentos_projetos}',OLD.detalhe->'orcamentos_projetos');
  ELSE
    NEW.detalhe:=jsonb_set(coalesce(NEW.detalhe,'{}'::jsonb),'{orcamentos_projetos}',public.orcamentos_do_periodo(NEW.client_id,NEW.ref_mes));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_fechamento_orcamentos BEFORE INSERT OR UPDATE OF detalhe,status ON public.faturamento_mensal
FOR EACH ROW EXECUTE FUNCTION public.tg_fechamento_orcamentos();

CREATE OR REPLACE FUNCTION public.preparar_orcamentos_fechamento(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_ver_dinheiro() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  UPDATE public.faturamento_mensal SET detalhe=coalesce(detalhe,'{}'::jsonb) WHERE id=_id
  RETURNING detalhe->'orcamentos_projetos' INTO resultado;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado'; END IF;
  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.preparar_orcamentos_fechamento(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preparar_orcamentos_fechamento(uuid) TO authenticated;

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

  IF _refs IS NOT NULL THEN _desc:=_desc || ' · Orçamentos: ' || _refs; END IF;

  insert into public.invoices (client_id, descricao, valor, data_emissao, status, created_by)
  values (f.client_id, _desc, _valor, _emissao, 'rascunho', auth.uid())
  returning id into _inv;

  update public.faturamento_mensal
     set invoice_id = _inv, status = 'faturado'
   where id = _id;

  return _inv;
end;
$$;


COMMIT;
