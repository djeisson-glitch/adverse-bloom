SET test.uid='00000000-0000-0000-0000-000000000001';
SET test.money='true';
DO $$
DECLARE client uuid:=gen_random_uuid(); otherclient uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();p3 uuid:=gen_random_uuid();cid uuid;cid2 uuid;rows jsonb;diarias numeric;n int;payload jsonb;
BEGIN
 INSERT INTO clients VALUES(client,'Demo'),(otherclient,'Outro');
 payload:='{"nome":"Contrato","inicio":"2026-09-15","fim":"2026-10-25","valor_mensal":5000,"diarias_mes":1.5,"entregas_mes":4,"acumulo_meses":2}'::jsonb;
 cid:=salvar_contrato_cliente(client,payload);
 cid2:=salvar_contrato_cliente(client,payload);
 IF cid<>cid2 OR (SELECT count(*) FROM client_contratos WHERE client_id=client)<>1 THEN RAISE EXCEPTION 'contrato duplicou';END IF;
 IF (SELECT modelo FROM client_faturamento WHERE client_id=client)<>'contrato' THEN RAISE EXCEPTION 'modelo não atualizado';END IF;
 INSERT INTO budgets VALUES(b,'{"faturamento":"avulso","carta_simples":{"ac":"Ana"}}');
 INSERT INTO projects VALUES(p1,client,'Projeto 1',b,'mensal','2026-10-02T12:00:00Z');
 IF (SELECT faturamento FROM projects WHERE id=p1)<>'avulso' THEN RAISE EXCEPTION 'não herdou orçamento';END IF;
 UPDATE budgets SET proposta=proposta||'{"faturamento":"mensal"}'::jsonb WHERE id=b;
 IF (SELECT faturamento FROM projects WHERE id=p1)<>'mensal' THEN RAISE EXCEPTION 'não sincronizou projeto';END IF;
 UPDATE projects SET faturamento='avulso' WHERE id=p1;
 UPDATE budgets SET proposta=proposta||'{"texto":"edição de carta"}'::jsonb WHERE id=b;
 IF (SELECT faturamento FROM projects WHERE id=p1)<>'avulso' THEN RAISE EXCEPTION 'edição não relacionada reclassificou projeto';END IF;
 UPDATE projects SET faturamento='mensal' WHERE id=p1;
 INSERT INTO projects VALUES(p2,client,'Projeto 2',null,'mensal','2026-10-02T12:00:00Z'),(p3,otherclient,'Outro cliente',null,'mensal','2026-10-02T12:00:00Z');
 INSERT INTO producao_saidas VALUES
 (gen_random_uuid(),p1,'diaria','realizada','2026-10-01',1),
 (gen_random_uuid(),p2,'diaria','realizada','2026-10-01',0.5),
 (gen_random_uuid(),p1,'diaria','confirmada','2026-10-03',0.5),
 (gen_random_uuid(),p1,'diaria','cancelada','2026-10-04',1),
 (gen_random_uuid(),p1,'diaria','realizada','2026-09-01',1),
 (gen_random_uuid(),p1,'diaria','realizada','2026-10-28',1),
 (gen_random_uuid(),p3,'diaria','realizada','2026-10-01',1);
 INSERT INTO deliverables VALUES
 (gen_random_uuid(),p1,'Peça no fee','em_edicao',null),
 (gen_random_uuid(),p1,'Peça à parte','em_edicao','avulso'),
 (gen_random_uuid(),p1,'Cancelada','cancelado',null),
 (gen_random_uuid(),p3,'Outro cliente','em_edicao',null);
 rows:=contrato_movimentos(cid,'2026-10-31');
 SELECT sum((x->>'quantidade')::numeric) INTO diarias FROM jsonb_array_elements(rows) x WHERE x->>'tipo'='diaria';
 IF diarias<>1.5 THEN RAISE EXCEPTION 'diárias incorretas: %',rows;END IF;
 SELECT count(*) INTO n FROM jsonb_array_elements(rows) x WHERE x->>'tipo'='entrega' AND x->>'faturamento'='mensal';
 IF n<>1 OR jsonb_array_length(rows)<>4 THEN RAISE EXCEPTION 'peças incorretas: %',rows;END IF;
 PERFORM set_config('test.money','false',true);
 BEGIN PERFORM contrato_movimentos(cid,'2026-10-31');RAISE EXCEPTION 'vazou leitura'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Sem permissão' THEN RAISE;END IF;END;
 BEGIN PERFORM salvar_contrato_cliente(client,payload);RAISE EXCEPTION 'permitiu escrita'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Sem permissão' THEN RAISE;END IF;END;
 PERFORM set_config('test.money','true',true);
 BEGIN PERFORM salvar_contrato_cliente(client,payload||'{"documento_path":"outro/contrato.pdf"}');RAISE EXCEPTION 'documento errado aceito'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Documento de outro cliente' THEN RAISE;END IF;END;
 RAISE NOTICE 'PASS: contrato sem duplicação, configuração, herança e sincronização, preservação de exceções, diárias compartilhadas/fracionadas/canceladas, vigência, isolamento por cliente, peças à parte e permissões';
END $$;
