-- Executar após a migration, sempre em transação revertida. Não cria diretórios.
BEGIN;
SET LOCAL ROLE postgres;

DO $$
DECLARE p uuid; admin_id uuid; token text; result jsonb; j jsonb; failed boolean := false;
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
 SELECT id INTO p FROM public.projects WHERE client_id IS NOT NULL AND numero IS NOT NULL LIMIT 1;
 IF admin_id IS NULL OR p IS NULL THEN RAISE EXCEPTION 'Faltam dados para validar'; END IF;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 token:=public.pastas_configurar_servidor();
 result:=public.pastas_solicitar(p,'Cliente Teste');
 PERFORM public.pastas_solicitar(p,'Outro nome');
 IF (SELECT count(*) FROM public.project_folders)<>1 THEN RAISE EXCEPTION 'Duplicou pedido'; END IF;
 j:=public.pastas_buscar_pedido(token);
 IF j IS NULL THEN RAISE EXCEPTION 'Não retirou pedido'; END IF;
 IF public.pastas_buscar_pedido(token) IS NOT NULL THEN RAISE EXCEPTION 'Duplicou trabalho'; END IF;
 PERFORM public.pastas_concluir(token,p,(j->>'lease_id')::uuid,'caminho/teste',NULL);
 result:=public.pastas_solicitar(p,'Outro nome');
 IF result->'job'->>'status'<>'ready' THEN RAISE EXCEPTION 'Não preservou concluído'; END IF;
 BEGIN PERFORM public.pastas_buscar_pedido('token-invalido'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Aceitou token inválido'; END IF;
 failed:=false;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM public.pastas_solicitar(p,'Cliente'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Aceitou usuário não autenticado'; END IF;
 IF has_table_privilege('anon','public.project_folder_agents','SELECT') OR has_table_privilege('authenticated','public.project_folder_agents','SELECT') THEN RAISE EXCEPTION 'Token exposto'; END IF;
 IF has_function_privilege('anon','public.pastas_configurar_servidor()','EXECUTE') THEN RAISE EXCEPTION 'Setup exposto'; END IF;
 RAISE NOTICE 'Fila, idempotência, concessão exclusiva, conclusão e permissões: OK';
END $$;
SELECT 'VALIDACAO_OK';
ROLLBACK;
