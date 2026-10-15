-- Validar com rollback: nenhum pedido fica visível para o conector.
BEGIN;
SET LOCAL ROLE postgres;
DO $$
DECLARE p uuid; p2 uuid; d uuid; coord uuid; ordinary uuid; requested timestamptz; failed boolean;
BEGIN
 SELECT user_id INTO coord FROM public.user_roles WHERE role='coordenadora' LIMIT 1;
 IF coord IS NULL THEN RAISE EXCEPTION 'Coordenadora não encontrada'; END IF;
 SELECT pr.id, de.id INTO p,d FROM public.projects pr JOIN public.deliverables de ON de.project_id=pr.id
 WHERE pr.client_id IS NOT NULL AND pr.numero IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_folders f WHERE f.project_id=pr.id) LIMIT 1;
 SELECT pr.id INTO p2 FROM public.projects pr WHERE EXISTS(SELECT 1 FROM public.deliverables de WHERE de.project_id=pr.id) AND pr.id<>p AND pr.client_id IS NOT NULL AND pr.numero IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.project_folders f WHERE f.project_id=pr.id) LIMIT 1;
 IF p IS NULL OR p2 IS NULL THEN RAISE EXCEPTION 'Faltam projetos para validar'; END IF;
 PERFORM set_config('request.jwt.claim.sub',coord::text,true);
 UPDATE public.projects SET status='novo' WHERE id IN(p,p2);
 IF EXISTS(SELECT 1 FROM public.project_folders WHERE project_id IN(p,p2)) THEN RAISE EXCEPTION 'Criou sem liberação'; END IF;
 -- Nenhum gatilho de INSERT: cadastrar não é liberar.
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname IN('pastas_liberacao_projeto','pastas_liberacao_entregavel') AND (tgtype & 4)<>0) THEN RAISE EXCEPTION 'Dispara no cadastro'; END IF;
 UPDATE public.project_folder_agents SET enabled=false;
 UPDATE public.projects SET status='pre-producao' WHERE id=p;
 IF NOT EXISTS(SELECT 1 FROM public.project_folders WHERE project_id=p AND status='pending' AND requested_by=coord) THEN RAISE EXCEPTION 'Pré-produção não criou fila offline'; END IF;
 IF (SELECT (payload->>'month')::integer FROM public.project_folders WHERE project_id=p) <> (SELECT extract(month FROM coalesce(criado_em,created_at) AT TIME ZONE 'America/Sao_Paulo') FROM public.projects WHERE id=p) THEN RAISE EXCEPTION 'Mês incorreto'; END IF;
 SELECT requested_at INTO requested FROM public.project_folders WHERE project_id=p;
 UPDATE public.deliverables SET status='pendente' WHERE id=d;
 UPDATE public.deliverables SET status='pronto_editar' WHERE id=d;
 IF (SELECT requested_at FROM public.project_folders WHERE project_id=p) IS DISTINCT FROM requested THEN RAISE EXCEPTION 'Reenfileirou ao liberar edição'; END IF;
 IF (SELECT count(*) FROM public.project_folders WHERE project_id=p)<>1 THEN RAISE EXCEPTION 'Duplicou pedido'; END IF;
 UPDATE public.project_folders SET status='ready',relative_path='existente/preservar' WHERE project_id=p;
 UPDATE public.projects SET status='novo' WHERE id=p;
 UPDATE public.projects SET status='pre-producao' WHERE id=p;
 IF NOT EXISTS(SELECT 1 FROM public.project_folders WHERE project_id=p AND status='ready' AND relative_path='existente/preservar') THEN RAISE EXCEPTION 'Recriou concluído'; END IF;
 failed:=false;
 BEGIN PERFORM public.pastas_reprocessar(p2); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Reprocessar criou pedido novo'; END IF;
 -- Sem passagem pela pré-produção, liberar uma peça também cria o pedido.
 SELECT id INTO d FROM public.deliverables WHERE project_id=p2 LIMIT 1;
 IF d IS NULL THEN RAISE EXCEPTION 'Segundo projeto precisa de entregável'; END IF;
 UPDATE public.deliverables SET status='pendente' WHERE id=d;
 UPDATE public.deliverables SET status='pronto_editar' WHERE id=d;
 IF NOT EXISTS(SELECT 1 FROM public.project_folders WHERE project_id=p2 AND status='pending') THEN RAISE EXCEPTION 'Edição direta não enfileirou'; END IF;
 UPDATE public.project_folders SET status='error',error='Teste' WHERE project_id=p2;
 PERFORM public.pastas_reprocessar(p2);
 IF NOT EXISTS(SELECT 1 FROM public.project_folders WHERE project_id=p2 AND status='pending' AND error IS NULL) THEN RAISE EXCEPTION 'Não recuperou falha'; END IF;
 -- Sem autenticação ou papel de coordenação, não cria.
 DELETE FROM public.project_folders WHERE project_id=p2;
 PERFORM set_config('request.jwt.claim.sub','',true);
 UPDATE public.projects SET status='pre-producao' WHERE id=p2;
 IF EXISTS(SELECT 1 FROM public.project_folders WHERE project_id=p2) THEN RAISE EXCEPTION 'Automação sem usuário criou pedido'; END IF;
 SELECT pr.id INTO ordinary FROM public.profiles pr WHERE NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=pr.id AND r.role IN('admin','coordenadora')) LIMIT 1;
 IF ordinary IS NOT NULL THEN
  PERFORM set_config('request.jwt.claim.sub',ordinary::text,true);
  UPDATE public.projects SET status='novo' WHERE id=p2;
  UPDATE public.projects SET status='pre-producao' WHERE id=p2;
  IF EXISTS(SELECT 1 FROM public.project_folders WHERE project_id=p2) THEN RAISE EXCEPTION 'Editor criou pedido'; END IF;
 END IF;
 IF has_function_privilege('authenticated','public.pastas_solicitar(uuid,text)','EXECUTE') OR has_function_privilege('authenticated','public.pastas_enfileirar_liberacao(uuid,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Criação manual exposta'; END IF;
 IF public.pastas_nome_seguro('Cliente / Sul: teste.')<>'Cliente _ Sul_ teste' THEN RAISE EXCEPTION 'Nome inseguro'; END IF;
END $$;
SELECT 'AUTOMACAO_VALIDADA';
ROLLBACK;
