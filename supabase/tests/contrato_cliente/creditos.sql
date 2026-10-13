BEGIN;
SET test.uid='00000000-0000-0000-0000-000000000001';
SET test.money='true';
DO $$
DECLARE cli uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); cid uuid; rows jsonb; payload jsonb;
BEGIN
 INSERT INTO clients VALUES(cli,'Créditos fixture');
 payload:='{"nome":"Contrato","inicio":"2026-02-01","fim":"2027-01-31","valor_mensal":6100,"diarias_mes":1,"entregas_mes":8,"acumulo_meses":2,"validade_creditos_dias":60,"limite_diarias_acumuladas":2,"limite_entregas_acumuladas":16,"franquia_entregas_tipo":"video_foto"}';
 cid:=salvar_contrato_cliente(cli,payload);
 IF NOT EXISTS(SELECT 1 FROM client_contratos WHERE id=cid AND validade_creditos_dias=60 AND limite_entregas_acumuladas=16 AND franquia_entregas_tipo='video_foto') THEN RAISE EXCEPTION 'credit configuration not saved'; END IF;
 PERFORM salvar_contrato_cliente(cli,payload - 'validade_creditos_dias' - 'franquia_entregas_tipo');
 IF NOT EXISTS(SELECT 1 FROM client_contratos WHERE id=cid AND validade_creditos_dias=60 AND franquia_entregas_tipo='video_foto') THEN RAISE EXCEPTION 'old client erased configuration'; END IF;
 INSERT INTO projects VALUES(p,cli,'Projeto',null,'mensal','2026-02-03T12:00:00Z');
 INSERT INTO deliverables(id,project_id,titulo,status,faturamento,tipo_midia) VALUES
 (gen_random_uuid(),p,'Título genérico','entregue',null,'foto'),
 (gen_random_uuid(),p,'Vídeo','em_edicao',null,'video');
 rows:=contrato_movimentos(cid,'2026-03-01');
 IF jsonb_array_length(rows)<>2 OR NOT jsonb_path_exists(rows,'$[*] ? (@.tipo_midia == "foto")') OR NOT jsonb_path_exists(rows,'$[*] ? (@.tipo_midia == "video")') THEN RAISE EXCEPTION 'media type missing from movements: %',rows; END IF;
 BEGIN PERFORM salvar_contrato_cliente(cli,payload||'{"validade_creditos_dias":0}');RAISE EXCEPTION 'zero validity accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Revise validade, limites e tipo da franquia' THEN RAISE;END IF;END;
 BEGIN PERFORM salvar_contrato_cliente(cli,payload||'{"limite_entregas_acumuladas":-1}');RAISE EXCEPTION 'negative cap accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Revise validade, limites e tipo da franquia' THEN RAISE;END IF;END;
 PERFORM set_config('test.money','false',true);
 BEGIN PERFORM contrato_movimentos(cid,'2026-03-01');RAISE EXCEPTION 'permission bypass';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Sem permissão' THEN RAISE;END IF;END;
 RAISE NOTICE 'PASS: persisted settings, backwards compatibility, media metadata, validation, permissions';
END $$;
ROLLBACK;
