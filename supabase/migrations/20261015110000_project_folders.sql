-- A fila é compartilhada; somente o conector do servidor executa pedidos explícitos.
CREATE TABLE public.project_folder_agents (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), token_hash text NOT NULL,
 last_seen_at timestamptz, enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE public.project_folder_clients (
 client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
 folder_name text NOT NULL
);
CREATE TABLE public.project_folders (
 project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','working','ready','error')),
 payload jsonb NOT NULL, requested_by uuid REFERENCES auth.users(id),
 requested_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 lease_id uuid, lease_until timestamptz, relative_path text, error text
);
ALTER TABLE public.project_folder_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_folder_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_folder_agents, public.project_folder_clients, public.project_folders FROM anon, authenticated;

CREATE FUNCTION public.pastas_permitido() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coordenadora'));
$$;
REVOKE ALL ON FUNCTION public.pastas_permitido() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pastas_permitido() TO authenticated;

CREATE FUNCTION public.pastas_estado(_project_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; cliente uuid;
BEGIN
 IF NOT public.pastas_permitido() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 SELECT client_id INTO cliente FROM public.projects WHERE id=_project_id;
 SELECT to_jsonb(f)-'lease_id'-'lease_until' INTO r FROM public.project_folders f WHERE project_id=_project_id;
 RETURN jsonb_build_object('job',r,'client_folder',(SELECT folder_name FROM public.project_folder_clients WHERE client_id=cliente),
 'configured',EXISTS(SELECT 1 FROM public.project_folder_agents WHERE enabled),
 'online',COALESCE((SELECT enabled AND last_seen_at > now()-interval '3 minutes' FROM public.project_folder_agents),false));
END; $$;
REVOKE ALL ON FUNCTION public.pastas_estado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pastas_estado(uuid) TO authenticated;

CREATE FUNCTION public.pastas_configurar_servidor() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE token text := encode(extensions.gen_random_bytes(32),'hex');
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 INSERT INTO public.project_folder_agents(id,token_hash) VALUES(true,encode(extensions.digest(token,'sha256'),'hex'))
 ON CONFLICT(id) DO UPDATE SET token_hash=EXCLUDED.token_hash,last_seen_at=NULL,enabled=true;
 RETURN token;
END; $$;
REVOKE ALL ON FUNCTION public.pastas_configurar_servidor() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pastas_configurar_servidor() TO authenticated;

CREATE FUNCTION public.pastas_solicitar(_project_id uuid,_client_folder text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.projects; j public.project_folders; data_base timestamp;
BEGIN
 IF NOT public.pastas_permitido() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_folder_agents WHERE enabled) THEN RAISE EXCEPTION 'Conecte o servidor primeiro'; END IF;
 SELECT * INTO p FROM public.projects WHERE id=_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Projeto não encontrado'; END IF;
 SELECT * INTO j FROM public.project_folders WHERE project_id=p.id;
 IF j.status IN ('ready','pending','working') THEN RETURN public.pastas_estado(p.id); END IF;
 IF p.client_id IS NULL OR nullif(trim(p.numero),'') IS NULL THEN RAISE EXCEPTION 'Preencha o cliente e o número do projeto'; END IF;
 IF length(trim(_client_folder)) NOT BETWEEN 1 AND 100 OR _client_folder ~ '[\\/:*?"<>|[:cntrl:]]' OR trim(_client_folder) IN ('.','..') THEN
  RAISE EXCEPTION 'Nome de pasta do cliente inválido';
 END IF;
 data_base := COALESCE(p.criado_em,p.created_at) AT TIME ZONE 'America/Sao_Paulo';
 INSERT INTO public.project_folder_clients(client_id,folder_name) VALUES(p.client_id,trim(_client_folder))
 ON CONFLICT(client_id) DO UPDATE SET folder_name=EXCLUDED.folder_name;
 INSERT INTO public.project_folders(project_id,payload,requested_by) VALUES(p.id,jsonb_build_object(
  'project_id',p.id,'number',p.numero,'project_name',p.nome_padrao,'client_folder',trim(_client_folder),
  'year',extract(year FROM data_base)::integer,'month',extract(month FROM data_base)::integer),auth.uid())
 ON CONFLICT(project_id) DO UPDATE SET status='pending',payload=EXCLUDED.payload,requested_by=auth.uid(),
 requested_at=now(),updated_at=now(),lease_id=NULL,lease_until=NULL,error=NULL;
 RETURN public.pastas_estado(p.id);
END; $$;
REVOKE ALL ON FUNCTION public.pastas_solicitar(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pastas_solicitar(uuid,text) TO authenticated;

-- O token só permite buscar um pedido e informar seu resultado. Não dá acesso ao restante do banco.
CREATE FUNCTION public.pastas_buscar_pedido(_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE j public.project_folders;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.project_folder_agents WHERE enabled AND token_hash=encode(extensions.digest(_token,'sha256'),'hex')) THEN
  RAISE EXCEPTION 'Conector não autorizado';
 END IF;
 UPDATE public.project_folder_agents SET last_seen_at=now() WHERE id;
 SELECT * INTO j FROM public.project_folders WHERE status='pending' OR (status='working' AND lease_until<now())
 ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.project_folders SET status='working',lease_id=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now()
 WHERE project_id=j.project_id RETURNING * INTO j;
 RETURN jsonb_build_object('payload',j.payload,'lease_id',j.lease_id);
END; $$;
REVOKE ALL ON FUNCTION public.pastas_buscar_pedido(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pastas_buscar_pedido(text) TO anon,authenticated;

CREATE FUNCTION public.pastas_concluir(_token text,_project_id uuid,_lease_id uuid,_path text,_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.project_folder_agents WHERE enabled AND token_hash=encode(extensions.digest(_token,'sha256'),'hex')) THEN
  RAISE EXCEPTION 'Conector não autorizado';
 END IF;
 IF _error IS NULL AND nullif(_path,'') IS NULL THEN RAISE EXCEPTION 'Caminho não informado'; END IF;
 UPDATE public.project_folders SET status=CASE WHEN _error IS NULL THEN 'ready' ELSE 'error' END,
 relative_path=CASE WHEN _error IS NULL THEN left(_path,1000) ELSE relative_path END,error=left(_error,500),
 updated_at=now(),lease_id=NULL,lease_until=NULL
 WHERE project_id=_project_id AND lease_id=_lease_id AND status='working';
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido expirado ou já concluído'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.pastas_concluir(text,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pastas_concluir(text,uuid,uuid,text,text) TO anon,authenticated;
