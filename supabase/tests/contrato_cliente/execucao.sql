BEGIN;
SET test.uid='00000000-0000-0000-0000-000000000001';
SET test.money='true';
DO $$
DECLARE cli uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); cid uuid; rows jsonb; diaria jsonb;
BEGIN
 INSERT INTO clients VALUES(cli,'Execução fixture');
 cid:=salvar_contrato_cliente(cli,'{"nome":"Contrato","inicio":"2026-02-01","fim":"2027-01-31","valor_mensal":6100,"diarias_mes":1,"entregas_mes":8,"acumulo_meses":2}');
 INSERT INTO projects VALUES(p,cli,'Projeto A',null,'mensal','2026-02-03T12:00:00Z'),(p2,cli,'Projeto B',null,'mensal','2026-02-03T12:00:00Z');
 INSERT INTO producao_saidas VALUES
 (gen_random_uuid(),p,'diaria','realizada','2026-03-01',0.5),
 (gen_random_uuid(),p2,'diaria','realizada','2026-03-01',0.25),
 (gen_random_uuid(),p2,'diaria','programada','2026-03-01',1),
 (gen_random_uuid(),p,'diaria','cancelada','2026-03-01',2),
 (gen_random_uuid(),p,'diaria','programada','2026-03-02',1);
 rows:=contrato_movimentos(cid,'2026-10-13');
 SELECT value INTO diaria FROM jsonb_array_elements(rows) WHERE value->>'data'='2026-03-01';
 IF (diaria->>'quantidade_realizada')::numeric<>0.5 OR (diaria->>'quantidade')::numeric<>1 OR diaria->>'status'<>'programada' THEN RAISE EXCEPTION 'Mixed day incorrect: %',diaria; END IF;
 SELECT value INTO diaria FROM jsonb_array_elements(rows) WHERE value->>'data'='2026-03-02';
 IF (diaria->>'quantidade_realizada')::numeric<>0 THEN RAISE EXCEPTION 'Scheduled day deducted: %',diaria; END IF;
 RAISE NOTICE 'PASS: completed fraction deduplicated; scheduled excluded; ledger preserved';
END $$;
ROLLBACK;
