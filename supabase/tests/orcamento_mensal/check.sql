\set ON_ERROR_STOP on
BEGIN;
SET test.uid='10000000-0000-0000-0000-000000000001';
SET test.money='true';
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM faturamento_mensal WHERE client_id='d3a96591-55b7-4b64-a445-72aaa28eb950' AND ref_mes='2026-07-01' AND total=1650 AND detalhe ? 'orcamento_mensal') THEN RAISE EXCEPTION 'Não consolidou rascunho antigo'; END IF;
 IF NOT EXISTS(SELECT FROM projects WHERE id='20000000-0000-0000-0000-000000000001' AND budget_id='30000000-0000-0000-0000-000000000001') OR NOT EXISTS(SELECT FROM budgets WHERE budget_number=313 AND total_value=1650) THEN RAISE EXCEPTION 'Alterou orçamento comercial anterior'; END IF;
END $$;
DO $$
DECLARE cli uuid:='d3a96591-55b7-4b64-a445-72aaa28eb950'; p uuid; q uuid; aparte uuid; f uuid; b uuid; n int; rows jsonb; d jsonb; rev bigint; inv uuid; oldref jsonb; negado bool;
BEGIN
 INSERT INTO projects(client_id,name,criado_em) VALUES(cli,'Mensal A','2026-10-01') RETURNING id INTO p;
 INSERT INTO projects(client_id,name,criado_em) VALUES(cli,'Mensal B','2026-10-01') RETURNING id INTO q;
 IF EXISTS(SELECT 1 FROM projects WHERE id IN(p,q) AND budget_id IS NOT NULL) THEN RAISE EXCEPTION 'Mensal criou orçamento por projeto'; END IF;
 INSERT INTO deliverables(project_id) VALUES(p),(q);
 -- A mesma peça/projeto pode ter movimentos dentro e fora do fee.
 INSERT INTO deliverables(project_id,faturamento) VALUES(p,'avulso');
 INSERT INTO projects(client_id,name,faturamento,criado_em) VALUES(cli,'Pontual','avulso','2026-10-01') RETURNING id INTO aparte;
 IF NOT EXISTS(SELECT 1 FROM projects WHERE id=aparte AND budget_id IS NOT NULL) THEN RAISE EXCEPTION 'Avulso sem referência'; END IF;
 INSERT INTO deliverables(project_id) VALUES(aparte);
 INSERT INTO faturamento_mensal(client_id,ref_mes,modelo,total,detalhe) VALUES(cli,'2026-10-01','horas',652.29,'{}') RETURNING id,detalhe INTO f,d;
 b:=(d->'orcamento_mensal'->>'budget_id')::uuid; n:=(d->'orcamento_mensal'->>'orcamento_numero')::int;
 IF b IS NULL OR n IS NULL THEN RAISE EXCEPTION 'Falta orçamento mensal'; END IF;
 rows:=d->'orcamentos_projetos';
 IF (SELECT count(*) FROM jsonb_array_elements(rows) WHERE value->'baldes' ? 'mensal')<>2 OR
    (SELECT count(DISTINCT value->>'budget_id') FROM jsonb_array_elements(rows) WHERE value->'baldes' ? 'mensal')<>1 THEN RAISE EXCEPTION 'Mais de uma referência mensal'; END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(rows) WHERE value->>'budget_id'=b::text AND value->'baldes' ? 'avulso') THEN RAISE EXCEPTION 'Avulso dentro do fee'; END IF;
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(rows) WHERE value->>'project_id'=p::text AND value->'baldes' ? 'avulso' AND value->>'budget_id'<>b::text) THEN RAISE EXCEPTION 'Perdeu referência mista'; END IF;
 IF (SELECT count(*) FROM orcamento_mensal_projetos WHERE budget_id=b AND ativo)<>2 THEN RAISE EXCEPTION 'Projetos do mês incorretos'; END IF;
 d:=ler_orcamento_mensal(b); rev:=(d->>'revisao')::bigint;
 IF EXISTS(SELECT FROM jsonb_array_elements(d->'projetos') WHERE value->>'custo' IS NOT NULL) THEN RAISE EXCEPTION 'Inventou custo'; END IF;
 d:=salvar_orcamento_mensal(b,rev,jsonb_build_array(jsonb_build_object('project_id',p,'receita',400,'custo',150),jsonb_build_object('project_id',q,'receita',252.29,'custo',200)));
 negado:=false;
 BEGIN PERFORM salvar_orcamento_mensal(b,rev,d->'projetos'); EXCEPTION WHEN raise_exception THEN negado:=true; END;
 IF NOT negado THEN RAISE EXCEPTION 'Aceitou versão desatualizada'; END IF;
 UPDATE faturamento_mensal SET detalhe='{}',total=700 WHERE id=f;
 IF (SELECT count(*) FROM budgets WHERE client_id=cli AND fechamento_mes='2026-10-01')<>1 THEN RAISE EXCEPTION 'Duplicou orçamento ao regerar'; END IF;
 IF (SELECT budget_number FROM budgets WHERE id=b)<>n OR (SELECT total_value FROM budgets WHERE id=b)<>700 THEN RAISE EXCEPTION 'Número/total inválidos'; END IF;
 IF (SELECT custo FROM orcamento_mensal_projetos WHERE budget_id=b AND project_id=p)<>150 THEN RAISE EXCEPTION 'Perdeu custo ao regerar'; END IF;
 -- Retirar projeto mantém histórico interno sem consumir o resultado mensal.
 UPDATE deliverables SET faturamento='avulso' WHERE project_id=q;
 UPDATE faturamento_mensal SET detalhe=detalhe WHERE id=f;
 IF (SELECT ativo FROM orcamento_mensal_projetos WHERE budget_id=b AND project_id=q) THEN RAISE EXCEPTION 'Projeto à parte permaneceu ativo'; END IF;
 UPDATE deliverables SET faturamento='mensal' WHERE project_id=q;
 UPDATE faturamento_mensal SET detalhe=detalhe WHERE id=f;
 IF (SELECT custo FROM orcamento_mensal_projetos WHERE budget_id=b AND project_id=q)<>200 THEN RAISE EXCEPTION 'Perdeu custo ao reativar'; END IF;
 d:=ler_orcamento_mensal(b); rev:=(d->>'revisao')::bigint;
 negado:=false;
 BEGIN PERFORM salvar_orcamento_mensal(b,rev,jsonb_build_array(jsonb_build_object('project_id',p,'receita',700,'custo',-1),jsonb_build_object('project_id',q,'receita',0,'custo',0))); EXCEPTION WHEN check_violation THEN negado:=true; END;
 IF NOT negado THEN RAISE EXCEPTION 'Aceitou custo negativo'; END IF;
 negado:=false;
 BEGIN PERFORM salvar_orcamento_mensal(b,rev,jsonb_build_array(jsonb_build_object('project_id',p,'receita',700,'custo',0),jsonb_build_object('project_id',aparte,'receita',0,'custo',0))); EXCEPTION WHEN raise_exception THEN negado:=true; END;
 IF NOT negado OR (SELECT receita FROM orcamento_mensal_projetos WHERE budget_id=b AND project_id=p)<>400 THEN RAISE EXCEPTION 'Projeto estrangeiro/atualização não atômica'; END IF;
 negado:=false;
 BEGIN PERFORM salvar_orcamento_mensal(b,rev,jsonb_build_array(jsonb_build_object('project_id',p,'receita',700,'custo',0),jsonb_build_object('project_id',p,'receita',0,'custo',0))); EXCEPTION WHEN raise_exception THEN negado:=true; END;
 IF NOT negado THEN RAISE EXCEPTION 'Aceitou duplicado'; END IF;
 -- Fatura usa apenas a referência única do mês e preserva valor.
 inv:=faturar_mes(f);
 IF faturar_mes(f)<>inv OR (SELECT valor FROM invoices WHERE id=inv)<>700 OR
   (SELECT descricao FROM invoices WHERE id=inv) NOT LIKE '%Orçamento: #'||lpad(n::text,4,'0') THEN RAISE EXCEPTION 'Fatura incorreta'; END IF;
 SELECT detalhe INTO oldref FROM faturamento_mensal WHERE id=f;
 UPDATE deliverables SET faturamento='avulso' WHERE project_id=p;
 UPDATE faturamento_mensal SET detalhe='{}' WHERE id=f;
 IF (SELECT detalhe->'orcamento_mensal' FROM faturamento_mensal WHERE id=f)<>oldref->'orcamento_mensal' OR
    (SELECT detalhe->'orcamentos_projetos' FROM faturamento_mensal WHERE id=f)<>oldref->'orcamentos_projetos' THEN RAISE EXCEPTION 'Reescreveu emitido'; END IF;
 -- Mesmo após voltar um documento enviado para rascunho, referências são imutáveis.
 UPDATE faturamento_mensal SET status='rascunho',invoice_id=NULL,referencias_emitidas=false WHERE id=f;
 UPDATE faturamento_mensal SET detalhe='{}' WHERE id=f;
 IF (SELECT detalhe->'orcamentos_projetos' FROM faturamento_mensal WHERE id=f)<>oldref->'orcamentos_projetos' THEN RAISE EXCEPTION 'Descongelou referência emitida'; END IF;
 -- Meses diferentes (inclusive sem movimento) têm números diferentes e únicos na fatura.
 INSERT INTO faturamento_mensal(client_id,ref_mes,modelo,total,detalhe) VALUES(cli,'2026-11-01','horas',100,'{}') RETURNING id,detalhe INTO f,d;
 IF (d->'orcamento_mensal'->>'budget_id')::uuid=b THEN RAISE EXCEPTION 'Reutilizou orçamento de outro mês'; END IF;
 inv:=faturar_mes(f);
 IF (SELECT descricao FROM invoices WHERE id=inv) NOT LIKE '%Orçamento: #%' THEN RAISE EXCEPTION 'Mês sem movimento perdeu referência'; END IF;
 IF EXISTS(SELECT FROM budgets WHERE fechamento_mes='2026-07-01' AND client_id='e5e9dee9-9a19-4eae-b49e-8fb14f3390c8') THEN RAISE EXCEPTION 'Migrou fechado histórico'; END IF;
 -- Permissão negada tanto para leitura quanto para edição.
 PERFORM set_config('test.money','false',true);
 negado:=false; BEGIN PERFORM ler_orcamento_mensal(b); EXCEPTION WHEN raise_exception THEN negado:=true; END;
 IF NOT negado THEN RAISE EXCEPTION 'Leitura sem permissão'; END IF;
 negado:=false; BEGIN PERFORM salvar_orcamento_mensal(b,rev,'[]'); EXCEPTION WHEN raise_exception THEN negado:=true; END;
 IF NOT negado THEN RAISE EXCEPTION 'Escrita sem permissão'; END IF;
 IF has_table_privilege('authenticated','orcamento_mensal_projetos','SELECT') OR has_table_privilege('authenticated','orcamento_mensal_projetos','UPDATE') OR has_function_privilege('anon','ler_orcamento_mensal(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Acesso direto exposto'; END IF;
END $$;
ROLLBACK;
\echo 'Orçamento mensal: invariantes, custos, referências, snapshots e permissões OK'
