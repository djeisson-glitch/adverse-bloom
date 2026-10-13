BEGIN;
SET test.uid='00000000-0000-0000-0000-000000000001';
SET test.money='true';
DO $$
DECLARE cli uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); cid uuid; rows jsonb;
BEGIN
 INSERT INTO clients VALUES(cli,'Ignorar fixture');
 cid:=salvar_contrato_cliente(cli,'{"nome":"Contrato","inicio":"2026-02-01","fim":"2027-01-31","valor_mensal":6100,"diarias_mes":1,"entregas_mes":8,"acumulo_meses":2}');
 INSERT INTO projects VALUES(p,cli,'Projeto',null,'mensal','2026-02-03T12:00:00Z');
 INSERT INTO deliverables(id,project_id,titulo,status,faturamento,tipo_midia) VALUES(d,p,'Vídeo','entregue','mensal','video');
 IF (SELECT ignorar_contrato FROM deliverables WHERE id=d) THEN RAISE EXCEPTION 'Ignored by default'; END IF;
 UPDATE deliverables SET ignorar_contrato=true WHERE id=d;
 rows:=contrato_movimentos(cid,'2026-10-13');
 IF jsonb_array_length(rows)<>1 OR NOT (rows->0->>'ignorar_contrato')::bool OR rows->0->>'tipo_midia'<>'video' OR rows->0->>'faturamento'<>'mensal' OR rows->0->>'status'<>'entregue' THEN RAISE EXCEPTION 'Ignore lost metadata or row: %',rows; END IF;
 UPDATE deliverables SET ignorar_contrato=false WHERE id=d;
 rows:=contrato_movimentos(cid,'2026-10-13');
 IF (rows->0->>'ignorar_contrato')::bool OR rows->0->>'tipo_midia'<>'video' THEN RAISE EXCEPTION 'Restore failed'; END IF;
 RAISE NOTICE 'PASS: ignore defaults off; RPC retains row and classification; reinclusion is reversible';
END $$;
ROLLBACK;
