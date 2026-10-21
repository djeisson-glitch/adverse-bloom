-- Somente em banco descartável vazio. Nunca executar esta fixture em produção.
CREATE TABLE public.deliverables(id int PRIMARY KEY,titulo text,formato text,status text,tipo_cobranca text);
INSERT INTO public.deliverables VALUES(1,'PÓS | Reel do evento','9x16','revisao_n1','Pílula');
\ir ../migrations/20261021170000_classificacao_visual_entregas.sql
BEGIN;
DO $$
DECLARE antes jsonb; rejeitado boolean;
BEGIN
 SELECT to_jsonb(d)-'classificacao_visual' INTO antes FROM deliverables d WHERE id=1;
 ASSERT (SELECT classificacao_visual IS NULL FROM deliverables WHERE id=1), 'histórico reclassificado no banco';
 UPDATE deliverables SET classificacao_visual=ARRAY['16x9','youtube'] WHERE id=1;
 ASSERT (SELECT classificacao_visual=ARRAY['16x9','youtube'] FROM deliverables WHERE id=1);
 ASSERT (SELECT to_jsonb(d)-'classificacao_visual'=antes FROM deliverables d WHERE id=1), 'dados da peça modificados';
 UPDATE deliverables SET classificacao_visual=null WHERE id=1;
 ASSERT (SELECT classificacao_visual IS NULL FROM deliverables WHERE id=1), 'não voltou ao automático';
 rejeitado:=false;
 BEGIN UPDATE deliverables SET classificacao_visual=ARRAY[]::text[] WHERE id=1; EXCEPTION WHEN check_violation THEN rejeitado:=true; END;
 ASSERT rejeitado,'array vazio aceito';
 rejeitado:=false;
 BEGIN UPDATE deliverables SET classificacao_visual=ARRAY['invalido'] WHERE id=1; EXCEPTION WHEN check_violation THEN rejeitado:=true; END;
 ASSERT rejeitado,'categoria desconhecida aceita';
 rejeitado:=false;
 BEGIN UPDATE deliverables SET classificacao_visual=ARRAY['reels',null] WHERE id=1; EXCEPTION WHEN check_violation THEN rejeitado:=true; END;
 ASSERT rejeitado,'valor nulo aceito';
 RAISE NOTICE 'OK: manual múltiplo, automático, validação e preservação de nome, formato, status e cobrança';
END $$;
ROLLBACK;
