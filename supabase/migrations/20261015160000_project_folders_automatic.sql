-- Liberação para produção é diferente de liberar material para edição.
-- Só transições explícitas feitas pela coordenação/admin; sem backfill ou INSERT.
CREATE FUNCTION public.pastas_nome_seguro(_nome text, _limite integer DEFAULT 100)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE n text;
BEGIN
 n:=regexp_replace(coalesce(_nome,''),'[\\/:*?"<>|[:cntrl:]]','_','g');
 n:=rtrim(left(btrim(n),_limite),' .');
 IF n='' THEN RAISE EXCEPTION 'Informe um nome para criar as pastas'; END IF;
 IF n ~* '^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)' THEN n:='_'||left(n,_limite-1); END IF;
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.pastas_nome_seguro(text,integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.pastas_enfileirar_liberacao(_project_id uuid,_reprocessar boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.projects; j public.project_folders; cliente text; pasta text; data_base timestamp; nome text;
BEGIN
 IF NOT public.pastas_permitido() THEN RETURN; END IF;
 SELECT * INTO p FROM public.projects WHERE id=_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Projeto não encontrado'; END IF;
 SELECT * INTO j FROM public.project_folders WHERE project_id=p.id;
 IF FOUND AND (NOT _reprocessar OR j.status<>'error') THEN RETURN; END IF;
 IF _reprocessar AND j.project_id IS NULL THEN RAISE EXCEPTION 'Não há pedido com erro para reprocessar'; END IF;
 IF p.client_id IS NULL OR nullif(btrim(p.numero),'') IS NULL THEN
  RAISE EXCEPTION 'Vincule um cliente e confira o número do projeto antes de liberar para produção';
 END IF;
 SELECT name INTO cliente FROM public.clients WHERE id=p.client_id;
 SELECT folder_name INTO pasta FROM public.project_folder_clients WHERE client_id=p.client_id;
 pasta:=coalesce(pasta,CASE cliente
   WHEN 'Sicredi Região da Produção RS/SC/MG' THEN 'Sicredi Região da Produção'
   WHEN 'Sicredi Sul Minas RS/MG' THEN 'Sicredi Sul Minas'
   ELSE cliente END);
 pasta:=public.pastas_nome_seguro(pasta);
 nome:=public.pastas_nome_seguro(coalesce(nullif(p.nome_padrao,''),'['||p.numero||']_'||p.name),150);
 data_base:=coalesce(p.criado_em,p.created_at) AT TIME ZONE 'America/Sao_Paulo';
 INSERT INTO public.project_folder_clients(client_id,folder_name) VALUES(p.client_id,pasta)
 ON CONFLICT(client_id) DO NOTHING;
 INSERT INTO public.project_folders(project_id,payload,requested_by)
 VALUES(p.id,jsonb_build_object('project_id',p.id,'number',p.numero,'project_name',nome,
  'client_folder',pasta,'year',extract(year FROM data_base)::integer,'month',extract(month FROM data_base)::integer),auth.uid())
 ON CONFLICT(project_id) DO UPDATE SET status='pending',payload=EXCLUDED.payload,
 requested_by=auth.uid(),requested_at=now(),updated_at=now(),lease_id=NULL,lease_until=NULL,error=NULL
 WHERE public.project_folders.status='error' AND _reprocessar;
END; $$;
REVOKE ALL ON FUNCTION public.pastas_enfileirar_liberacao(uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.pastas_ao_liberar_projeto() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='pre-producao' AND OLD.status IS DISTINCT FROM NEW.status THEN
  PERFORM public.pastas_enfileirar_liberacao(NEW.id);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.pastas_ao_liberar_projeto() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pastas_liberacao_projeto AFTER UPDATE OF status ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.pastas_ao_liberar_projeto();

CREATE FUNCTION public.pastas_ao_liberar_entregavel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='pronto_editar' AND OLD.status IS DISTINCT FROM NEW.status THEN
  PERFORM public.pastas_enfileirar_liberacao(NEW.project_id);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.pastas_ao_liberar_entregavel() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pastas_liberacao_entregavel AFTER UPDATE OF status ON public.deliverables
FOR EACH ROW EXECUTE FUNCTION public.pastas_ao_liberar_entregavel();

-- Recuperação de falha não permite criar pedidos novos nem repetir os concluídos.
CREATE FUNCTION public.pastas_reprocessar(_project_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.pastas_permitido() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_folders WHERE project_id=_project_id AND status='error') THEN
  RAISE EXCEPTION 'Não há pedido com erro para reprocessar';
 END IF;
 PERFORM public.pastas_enfileirar_liberacao(_project_id,true);
 RETURN public.pastas_estado(_project_id);
END; $$;
REVOKE ALL ON FUNCTION public.pastas_reprocessar(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pastas_reprocessar(uuid) TO authenticated;

-- Clientes antigos em cache não podem disparar a criação pelo botão removido.
REVOKE ALL ON FUNCTION public.pastas_solicitar(uuid,text) FROM PUBLIC,anon,authenticated;
