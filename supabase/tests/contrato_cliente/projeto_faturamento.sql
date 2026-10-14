BEGIN;
SET test.uid='00000000-0000-0000-0000-000000000001';
SET test.money='true';
DO $$
DECLARE cli uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); cid uuid; rows jsonb; modo text; excecao text; esperado text; d uuid; resultado text; outro uuid:=gen_random_uuid();
BEGIN
 INSERT INTO clients VALUES(cli,'Billing test');
 cid:=salvar_contrato_cliente(cli,'{"nome":"Contrato","inicio":"2026-02-01","fim":"2027-01-31","valor_mensal":6100,"acumulo_meses":2,"diarias_mes":1,"entregas_mes":8}');
 INSERT INTO projects VALUES(p,cli,'Projeto',null,'mensal','2026-03-01T12:00:00Z');
 INSERT INTO producao_saidas VALUES(gen_random_uuid(),p,'diaria','realizada','2026-03-01',1);
 FOREACH excecao IN ARRAY ARRAY[null,'mensal','avulso','mensal_separado']::text[] LOOP
  INSERT INTO deliverables(id,project_id,titulo,status,faturamento) VALUES(gen_random_uuid(),p,'Vídeo','entregue',excecao);
 END LOOP;
 FOREACH modo IN ARRAY ARRAY['mensal','avulso','mensal_separado','mensal'] LOOP
  UPDATE projects SET faturamento=modo WHERE id=p;
  FOR d,excecao IN SELECT id,faturamento FROM deliverables WHERE project_id=p LOOP
   esperado:=CASE WHEN modo='mensal' THEN coalesce(excecao,'mensal') ELSE modo END;
   SELECT faturamento_efetivo INTO resultado FROM deliverables_faturamento WHERE id=d;
   IF resultado IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'Precedence failed: %, %, %',modo,excecao,resultado; END IF;
  END LOOP;
  rows:=contrato_movimentos(cid,'2026-10-14');
  IF jsonb_array_length(rows)<>5 THEN RAISE EXCEPTION 'Lost records: %',rows; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->'projetos'->0->>'faturamento' IS DISTINCT FROM modo) THEN RAISE EXCEPTION 'Missing billing metadata'; END IF;
  IF modo<>'mensal' AND EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'faturamento'<>modo) THEN RAISE EXCEPTION 'Contract includes outside item'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM deliverables WHERE project_id=p AND faturamento IS NOT NULL)<>3 THEN RAISE EXCEPTION 'Overwrote original exceptions'; END IF;
 -- New deliveries and reassignment also inherit project priority immediately.
 UPDATE projects SET faturamento='avulso' WHERE id=p;
 d:=gen_random_uuid();
 INSERT INTO deliverables(id,project_id,titulo,status,faturamento) VALUES(d,p,'Nova','entregue','mensal');
 IF (SELECT faturamento_efetivo FROM deliverables_faturamento WHERE id=d)<>'avulso' THEN RAISE EXCEPTION 'New monthly override escaped parent'; END IF;
 UPDATE deliverables SET project_id=null WHERE id=d;
 IF (SELECT faturamento_efetivo FROM deliverables_faturamento WHERE id=d)<>'mensal' THEN RAISE EXCEPTION 'Orphan fallback broken'; END IF;
 UPDATE deliverables SET project_id=p WHERE id=d;
 IF (SELECT faturamento_efetivo FROM deliverables_faturamento WHERE id=d)<>'avulso' THEN RAISE EXCEPTION 'Moved delivery escaped parent'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='deliverables_faturamento'::regclass AND reloptions @> ARRAY['security_invoker=on']) THEN RAISE EXCEPTION 'View must respect RLS'; END IF;
 -- Frações individuais continuam corretas quando a mesma data é compartilhada.
 INSERT INTO projects VALUES(outro,cli,'Compartilhado',null,'avulso','2026-03-01T12:00:00Z');
 INSERT INTO producao_saidas VALUES(gen_random_uuid(),outro,'diaria','realizada','2026-03-01',0.5);
 rows:=contrato_movimentos(cid,'2026-10-14');
 IF (SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>'tipo'='diaria')<>1 THEN RAISE EXCEPTION 'Shared date duplicated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r, jsonb_array_elements(r->'projetos') pr
   WHERE r->>'tipo'='diaria' AND (r->>'quantidade_realizada')::numeric=1 AND pr->>'id'=outro::text AND (pr->>'diarias_realizadas')::numeric=0.5)
 THEN RAISE EXCEPTION 'Individual project fraction lost'; END IF;
 RAISE NOTICE 'PASS: parent priority, preserved overrides, contract metadata, days, new and moved deliveries, orphan fallback and security_invoker';
END $$;
ROLLBACK;
