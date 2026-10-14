-- Um orçamento por cliente/competência; projetos são centros de resultado internos.
BEGIN;
ALTER TABLE public.budgets ADD COLUMN fechamento_mes date;
ALTER TABLE public.faturamento_mensal ADD COLUMN referencias_emitidas boolean NOT NULL DEFAULT false;
UPDATE public.faturamento_mensal SET referencias_emitidas=true WHERE status IN ('enviado','faturado') OR invoice_id IS NOT NULL;
ALTER TABLE public.budgets ADD COLUMN fechamento_revisao bigint NOT NULL DEFAULT 0;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_fechamento_mes_inicio CHECK
 (fechamento_mes IS NULL OR (client_id IS NOT NULL AND fechamento_mes=date_trunc('month',fechamento_mes)::date AND origem_projeto_id IS NULL AND deal_id IS NULL));
CREATE UNIQUE INDEX budgets_cliente_mes_unico ON public.budgets(client_id,fechamento_mes) WHERE fechamento_mes IS NOT NULL;

CREATE TABLE public.orcamento_mensal_projetos (
 budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
 project_id uuid NOT NULL REFERENCES public.projects(id),
 projeto text NOT NULL, ativo boolean NOT NULL DEFAULT true,
 receita numeric(14,2) CHECK(receita>=0 AND receita<1000000000000),
 custo numeric(14,2) CHECK(custo>=0 AND custo<1000000000000),
 PRIMARY KEY(budget_id,project_id)
);
ALTER TABLE public.orcamento_mensal_projetos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orcamento_mensal_projetos FROM PUBLIC,anon,authenticated;
-- Valores internos somente pelas RPCs que checam a permissão financeira.

CREATE OR REPLACE FUNCTION public.tg_projeto_garante_orcamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.client_id IS NOT NULL AND NEW.budget_id IS NULL AND coalesce(NEW.faturamento,'mensal') IN ('avulso','mensal_separado') THEN
   PERFORM public.garantir_orcamento_projeto_interno(NEW.id);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER trg_projeto_garante_orcamento ON public.projects;
CREATE TRIGGER trg_projeto_garante_orcamento AFTER INSERT OR UPDATE OF client_id,budget_id,faturamento ON public.projects
 FOR EACH ROW EXECUTE FUNCTION public.tg_projeto_garante_orcamento();

CREATE OR REPLACE FUNCTION public.orcamentos_do_periodo(_client uuid,_mes date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ini date:=date_trunc('month',_mes)::date; fim date:=(date_trunc('month',_mes)+interval '1 month')::date;
 x record; bid uuid; b public.budgets%ROWTYPE; mensal public.budgets%ROWTYPE; resultado jsonb:='[]'::jsonb;
BEGIN
 SELECT * INTO mensal FROM public.budgets WHERE client_id=_client AND fechamento_mes=ini;
 IF mensal.id IS NULL THEN RAISE EXCEPTION 'Prepare o orçamento mensal primeiro'; END IF;
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
   IF x.baldes ? 'mensal' THEN
     resultado:=resultado||jsonb_build_array(jsonb_build_object('project_id',x.id,'projeto',x.name,
       'budget_id',mensal.id,'orcamento_numero',mensal.budget_number,'baldes',jsonb_build_array('mensal'),'mensal',true));
   END IF;
   IF (x.baldes - 'mensal' - 'ignorar') <> '[]'::jsonb THEN
     bid:=public.garantir_orcamento_projeto_interno(x.id);
     SELECT * INTO b FROM public.budgets WHERE id=bid;
     IF b.budget_number IS NULL THEN RAISE EXCEPTION 'Projeto sem número de orçamento: %',x.name; END IF;
     resultado:=resultado||jsonb_build_array(jsonb_build_object('project_id',x.id,'projeto',x.name,
       'budget_id',b.id,'deal_id',b.deal_id,'orcamento_numero',b.budget_number,'baldes',x.baldes - 'mensal' - 'ignorar'));
   END IF;
 END LOOP;
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.orcamentos_do_periodo(uuid,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tg_fechamento_orcamentos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.budgets%ROWTYPE; refs jsonb; x jsonb; cliente text; mes date:=date_trunc('month',NEW.ref_mes)::date;
BEGIN
 -- Documentos já emitidos conservam todas as referências e valores originais.
 IF TG_OP='UPDATE' AND (OLD.referencias_emitidas OR OLD.status IN ('enviado','faturado') OR OLD.invoice_id IS NOT NULL) THEN
   NEW.referencias_emitidas:=true;
   NEW.detalhe:=(coalesce(NEW.detalhe,'{}'::jsonb)-'orcamento_mensal'-'orcamentos_projetos') ||
     jsonb_build_object('orcamentos_projetos',coalesce(OLD.detalhe->'orcamentos_projetos','[]'::jsonb));
   IF OLD.detalhe ? 'orcamento_mensal' THEN NEW.detalhe:=NEW.detalhe||jsonb_build_object('orcamento_mensal',OLD.detalhe->'orcamento_mensal'); END IF;
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
DROP TRIGGER trg_fechamento_orcamentos ON public.faturamento_mensal;
CREATE TRIGGER trg_fechamento_orcamentos BEFORE INSERT OR UPDATE OF detalhe,status,total,referencias_emitidas ON public.faturamento_mensal
 FOR EACH ROW EXECUTE FUNCTION public.tg_fechamento_orcamentos();

-- Não permitir que os editores de orçamento avulso modifiquem/removam um fechamento.
CREATE FUNCTION public.proteger_orcamento_mensal() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') THEN
   IF (TG_OP<>'INSERT' AND OLD.fechamento_mes IS NOT NULL) OR (TG_OP<>'DELETE' AND NEW.fechamento_mes IS NOT NULL) THEN
     RAISE EXCEPTION 'Use o controle do orçamento mensal';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_proteger_orcamento_mensal BEFORE INSERT OR UPDATE OR DELETE ON public.budgets
 FOR EACH ROW EXECUTE FUNCTION public.proteger_orcamento_mensal();

CREATE FUNCTION public.ler_orcamento_mensal(_budget uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.budgets%ROWTYPE; linhas jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.pode_ver_dinheiro() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 SELECT * INTO b FROM public.budgets WHERE id=_budget AND fechamento_mes IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento mensal não encontrado'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('project_id',project_id,'projeto',projeto,'receita',receita,'custo',custo) ORDER BY projeto),'[]'::jsonb)
 INTO linhas FROM public.orcamento_mensal_projetos WHERE budget_id=b.id AND ativo;
 RETURN jsonb_build_object('id',b.id,'numero',b.budget_number,'cliente',b.client_name,'mes',b.fechamento_mes,
   'total',b.total_value,'revisao',b.fechamento_revisao,'projetos',linhas);
END $$;
REVOKE ALL ON FUNCTION public.ler_orcamento_mensal(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ler_orcamento_mensal(uuid) TO authenticated;

CREATE FUNCTION public.salvar_orcamento_mensal(_budget uuid,_revisao bigint,_projetos jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.budgets%ROWTYPE; x jsonb; n int;
BEGIN
 IF auth.uid() IS NULL OR NOT public.pode_ver_dinheiro() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 SELECT * INTO b FROM public.budgets WHERE id=_budget AND fechamento_mes IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento mensal não encontrado'; END IF;
 IF b.fechamento_revisao IS DISTINCT FROM _revisao THEN RAISE EXCEPTION 'O fechamento mudou. Recarregue antes de salvar.'; END IF;
 IF jsonb_typeof(_projetos) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Projetos inválidos'; END IF;
 SELECT count(*) INTO n FROM public.orcamento_mensal_projetos WHERE budget_id=b.id AND ativo;
 IF jsonb_array_length(_projetos)<>n OR (SELECT count(DISTINCT value->>'project_id') FROM jsonb_array_elements(_projetos))<>n THEN
   RAISE EXCEPTION 'Envie todos os projetos ativos, sem repetição';
 END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(_projetos) LOOP
   IF NOT (x ? 'receita' AND x ? 'custo') OR jsonb_typeof(x->'receita') NOT IN ('number','null') OR jsonb_typeof(x->'custo') NOT IN ('number','null') THEN
     RAISE EXCEPTION 'Informe valores numéricos ou deixe em branco';
   END IF;
   UPDATE public.orcamento_mensal_projetos SET receita=(x->>'receita')::numeric,custo=(x->>'custo')::numeric
    WHERE budget_id=b.id AND project_id=(x->>'project_id')::uuid AND ativo;
   IF NOT FOUND THEN RAISE EXCEPTION 'Projeto não pertence a este fechamento'; END IF;
 END LOOP;
 UPDATE public.budgets SET fechamento_revisao=fechamento_revisao+1 WHERE id=b.id;
 RETURN public.ler_orcamento_mensal(b.id);
END $$;
REVOKE ALL ON FUNCTION public.salvar_orcamento_mensal(uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_orcamento_mensal(uuid,bigint,jsonb) TO authenticated;

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

  IF f.detalhe ? 'orcamento_mensal' THEN
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

  IF _refs IS NOT NULL THEN _desc:=_desc || CASE WHEN f.detalhe ? 'orcamento_mensal' THEN ' · Orçamento: ' ELSE ' · Orçamentos: ' END || _refs; END IF;

  insert into public.invoices (client_id, descricao, valor, data_emissao, status, created_by)
  values (f.client_id, _desc, _valor, _emissao, 'rascunho', auth.uid())
  returning id into _inv;

  update public.faturamento_mensal
     set invoice_id = _inv, status = 'faturado'
   where id = _id;

  return _inv;
end;
$$;


-- Só rascunhos/revisados: nenhum número histórico ou fatura é apagado/renumerado.
UPDATE public.faturamento_mensal SET detalhe=coalesce(detalhe,'{}'::jsonb)
 WHERE status IN ('rascunho','revisado') AND invoice_id IS NULL;
COMMIT;
