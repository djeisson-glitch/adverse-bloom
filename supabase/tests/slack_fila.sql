-- Run only against a disposable database with slack_fixture.sql + the migration.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO profiles SELECT id,true FROM auth.users;
INSERT INTO notificacao_tipos VALUES ('ajuste','producao'),('negocio','comercial');
INSERT INTO slack_pessoas VALUES ('00000000-0000-0000-0000-000000000001','U12345678','Pessoa 1',true),('00000000-0000-0000-0000-000000000002','U98765432','Pessoa 2',true);
INSERT INTO notificacoes(user_id,tipo,titulo,nivel) VALUES ('00000000-0000-0000-0000-000000000001','ajuste','Antes',1);
SELECT pg_temp.assert((SELECT count(*)=0 FROM slack_entregas),'disabled integration has no backlog');
UPDATE slack_config SET enabled=true,channel_id='C12345678';
INSERT INTO notificacoes(user_id,tipo,titulo,nivel,dedupe_key,created_at)
SELECT id,'ajuste','Ajustar filme',1,'evento-1','2026-09-25 10:00:00+00' FROM auth.users;
SELECT pg_temp.assert((SELECT count(*)=3 FROM slack_entregas),'two DMs and one shared-channel entry');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','slack_claim()','EXECUTE'),'client cannot claim');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','slack_config','UPDATE'),'client cannot enable worker');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','slack_pessoas','INSERT'),'client cannot forge recipient');
CREATE TEMP TABLE batch AS SELECT slack_claim() AS payload;
SELECT pg_temp.assert((SELECT jsonb_array_length(payload->'items')=3 FROM batch),'claims eligible items');
SELECT pg_temp.assert(slack_claim() IS NULL,'concurrent worker is blocked');
SELECT slack_concluir(gen_random_uuid(),ARRAY(SELECT id FROM slack_entregas),NULL,'wrong');
SELECT pg_temp.assert((SELECT count(*)=3 FROM slack_entregas WHERE status='enviando'),'foreign token cannot acknowledge');
SELECT slack_concluir((SELECT (payload->>'token')::uuid FROM batch),ARRAY(SELECT id FROM slack_entregas WHERE destino='direta'),NULL,'123.456');
SELECT slack_concluir((SELECT (payload->>'token')::uuid FROM batch),ARRAY(SELECT id FROM slack_entregas WHERE destino='canal'),'ratelimited',NULL,120);
SELECT pg_temp.assert((SELECT count(*)=2 FROM slack_entregas WHERE status='enviada'),'Slack acceptance records delivery');
SELECT pg_temp.assert((SELECT count(*)=1 FROM slack_entregas WHERE status='pendente' AND proxima_em>=now()+interval '120 seconds'),'rate limit preserves queue with delay');
SELECT pg_temp.assert((SELECT count(*)=0 FROM notificacoes WHERE lida_em IS NOT NULL),'Slack delivery does not mark read');
SELECT slack_liberar((SELECT (payload->>'token')::uuid FROM batch),0);
UPDATE slack_config SET worker_until='-infinity';
INSERT INTO notificacoes(user_id,tipo,titulo,nivel) VALUES
('00000000-0000-0000-0000-000000000001','negocio','Privado',1),
('00000000-0000-0000-0000-000000000001','ajuste','Resumo',2),
('00000000-0000-0000-0000-000000000001','ajuste','Só sino',3);
SELECT pg_temp.assert((SELECT count(*)=1 FROM slack_entregas e JOIN notificacoes n ON n.id=e.notificacao_id WHERE n.titulo='Privado' AND e.destino='direta'),'commercial event stays in DM');
SELECT pg_temp.assert((SELECT count(*)=0 FROM slack_entregas e JOIN notificacoes n ON n.id=e.notificacao_id WHERE n.titulo='Só sino'),'bell-only does not enter Slack');
TRUNCATE batch; INSERT INTO batch SELECT slack_claim();
SELECT pg_temp.assert((SELECT jsonb_array_length(payload->'items')=1 FROM batch),'digest waits for configured hours');
-- Simulate a process that died after claiming, without acknowledging.
UPDATE slack_config SET worker_until='-infinity';
TRUNCATE batch; INSERT INTO batch SELECT slack_claim();
SELECT pg_temp.assert((SELECT jsonb_array_length(payload->'items')=1 FROM batch),'expired worker lease is recovered');
SELECT slack_concluir((SELECT (payload->>'token')::uuid FROM batch),ARRAY(SELECT id FROM slack_entregas WHERE status='enviando'),'missing_scope',NULL,60,true);
SELECT pg_temp.assert((SELECT count(*)=1 FROM slack_entregas WHERE status='falhou'),'permanent error visible instead of silently dropped');
SELECT slack_liberar((SELECT (payload->>'token')::uuid FROM batch),0);
UPDATE slack_config SET worker_until='-infinity';
UPDATE notificacoes SET lida_em=now() WHERE titulo='Resumo';
INSERT INTO notificacoes(user_id,tipo,titulo,nivel) VALUES ('00000000-0000-0000-0000-000000000002','ajuste','Pausar',1);
INSERT INTO notificacao_prefs VALUES ('00000000-0000-0000-0000-000000000002','ajuste','off');
TRUNCATE batch; INSERT INTO batch SELECT slack_claim();
SELECT pg_temp.assert((SELECT count(*)=4 FROM slack_entregas e JOIN notificacoes n ON n.id=e.notificacao_id WHERE n.titulo IN ('Resumo','Pausar') AND e.status='cancelada'),'resolved and disabled events canceled before delivery');
SELECT slack_liberar((SELECT (payload->>'token')::uuid FROM batch),0);
UPDATE slack_config SET worker_until='-infinity';
INSERT INTO notificacoes(user_id,tipo,titulo,nivel) VALUES ('00000000-0000-0000-0000-000000000001','ajuste','Novo ciclo',1);
UPDATE slack_pessoas SET slack_user_id='U11111111' WHERE user_id='00000000-0000-0000-0000-000000000001';
UPDATE slack_config SET channel_id='C22222222';
SELECT slack_claim();
SELECT pg_temp.assert((SELECT count(*)=2 FROM slack_entregas e JOIN notificacoes n ON n.id=e.notificacao_id WHERE n.titulo='Novo ciclo' AND e.status='cancelada'),'changed destinations do not receive historical notifications');
ROLLBACK;
