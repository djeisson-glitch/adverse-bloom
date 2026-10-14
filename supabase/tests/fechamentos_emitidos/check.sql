\set ON_ERROR_STOP on
BEGIN;
SET test.uid='10000000-0000-0000-0000-000000000001';
SET test.money='true';
DO $$
DECLARE f faturamento_mensal%ROWTYPE; b uuid; d jsonb; inv uuid; n int;
BEGIN
 IF EXISTS(SELECT FROM teste_emitidos_antes a JOIN faturamento_mensal fm ON fm.id=a.id
   WHERE a.dados IS DISTINCT FROM jsonb_set(to_jsonb(fm),'{detalhe}',CASE WHEN a.dados->'detalhe' ? 'orcamento_mensal' THEN fm.detalhe ELSE fm.detalhe-'orcamento_mensal' END)) THEN RAISE EXCEPTION 'Reescreveu snapshot original'; END IF;
 IF EXISTS(SELECT * FROM invoices EXCEPT SELECT * FROM teste_invoices_antes) OR EXISTS(SELECT * FROM teste_invoices_antes EXCEPT SELECT * FROM invoices) THEN RAISE EXCEPTION 'Alterou notas originais'; END IF;
 SELECT * INTO f FROM faturamento_mensal WHERE id='55000000-0000-0000-0000-000000000001';
 b:=(f.detalhe->'orcamento_mensal'->>'budget_id')::uuid;
 IF b IS NULL OR f.detalhe->'orcamento_mensal'->>'historico'<>'true' THEN RAISE EXCEPTION 'Não consolidou o faturado'; END IF;
 IF (SELECT total_value FROM budgets WHERE id=b)<>2902.90 THEN RAISE EXCEPTION 'Alterou total'; END IF;
 IF (SELECT count(*) FROM orcamento_mensal_projetos WHERE budget_id=b)<>1 OR NOT EXISTS(SELECT FROM orcamento_mensal_projetos WHERE budget_id=b AND projeto='Nome no fechamento') THEN RAISE EXCEPTION 'Não usou snapshot; incluiu movimento atual'; END IF;
 d:=ler_orcamento_mensal(b);
 PERFORM salvar_orcamento_mensal(b,(d->>'revisao')::bigint,jsonb_build_array(jsonb_build_object('project_id','25000000-0000-0000-0000-000000000001','receita',2902.90,'custo',1000)));
 PERFORM preparar_orcamentos_fechamento(f.id);
 IF (SELECT count(*) FROM budgets WHERE client_id=f.client_id AND fechamento_mes=f.ref_mes)<>1 OR (SELECT custo FROM orcamento_mensal_projetos WHERE budget_id=b)<>1000 THEN RAISE EXCEPTION 'Duplicou orçamento/perdeu custo'; END IF;
 IF faturar_mes(f.id)<>f.invoice_id THEN RAISE EXCEPTION 'Duplicou fatura'; END IF;
 -- Enviado antes da migração preserva as referências originais ao faturar depois.
 inv:=faturar_mes('55000000-0000-0000-0000-000000000002');
 IF (SELECT descricao FROM invoices WHERE id=inv) NOT LIKE '%Orçamentos: #0313' THEN RAISE EXCEPTION 'Trocou referência enviada'; END IF;
 IF has_function_privilege('authenticated','consolidar_orcamento_emitido(faturamento_mensal)','EXECUTE') OR has_function_privilege('anon','consolidar_orcamento_emitido(faturamento_mensal)','EXECUTE') THEN RAISE EXCEPTION 'Helper interno exposto'; END IF;
END $$;
ROLLBACK;
\echo 'Fechamentos emitidos: consolidação, histórico e custos OK'
