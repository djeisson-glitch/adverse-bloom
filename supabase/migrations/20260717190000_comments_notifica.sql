-- =====================================================================
-- Mensagens (comments): notificar ao comentar.
-- Regra: avisa os RESPONSÁVEIS da entidade (tarefa/entregável/projeto/deal)
-- + quem está marcado como "cópia de conversas" (coordenação, ex.: Maiara)
-- + quem foi @mencionado — nunca o próprio autor. Assim não enche a caixa
-- de todo mundo; pra puxar alguém de fora, usa-se o @.
-- =====================================================================

-- Flag de coordenação: recebe cópia de toda conversa.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS copia_conversas boolean NOT NULL DEFAULT false;

-- Admin/manager liga/desliga o flag de alguém (RLS do profiles não deixa
-- editar linha de terceiro, então vai por RPC controlada).
CREATE OR REPLACE FUNCTION public.set_copia_conversas(_uid uuid, _valor boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  UPDATE public.profiles SET copia_conversas = _valor WHERE id = _uid;
END; $$;
GRANT EXECUTE ON FUNCTION public.set_copia_conversas(uuid, boolean) TO authenticated;

-- Trigger: a cada mensagem nova, monta a lista de destinatários e notifica.
CREATE OR REPLACE FUNCTION public.tg_comment_notifica()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _autor text;
  _dest uuid[] := '{}';
  _pid uuid;
  _link text;
  _titulo text;
  _corpo text;
  u uuid;
BEGIN
  SELECT full_name INTO _autor FROM public.profiles WHERE id = NEW.user_id;
  _autor := COALESCE(NULLIF(_autor, ''), 'Alguém');
  _corpo := left(NEW.body, 160);

  -- responsáveis + link conforme a entidade comentada
  IF NEW.entity_type = 'task' THEN
    SELECT project_id INTO _pid FROM public.tasks WHERE id = NEW.entity_id;
    SELECT array_remove(array_agg(assigned_user_id), NULL) INTO _dest
      FROM public.tasks WHERE id = NEW.entity_id;
    _link := '/projetos/' || COALESCE(_pid::text, '');
  ELSIF NEW.entity_type = 'deliverable' THEN
    SELECT project_id INTO _pid FROM public.deliverables WHERE id = NEW.entity_id;
    SELECT array_remove(array_agg(responsavel_id), NULL) INTO _dest
      FROM public.deliverables WHERE id = NEW.entity_id;
    _link := '/projetos/' || COALESCE(_pid::text, '') || '/entregaveis/' || NEW.entity_id::text;
  ELSIF NEW.entity_type = 'project' THEN
    SELECT array_remove(array_agg(user_id), NULL) INTO _dest
      FROM public.project_members WHERE project_id = NEW.entity_id;
    _link := '/projetos/' || NEW.entity_id::text;
  ELSIF NEW.entity_type = 'deal' THEN
    SELECT array_remove(array_agg(created_by), NULL) INTO _dest
      FROM public.deals WHERE id = NEW.entity_id;
    _link := '/comercial';
  ELSE
    _link := '/notificacoes';
  END IF;

  _dest := COALESCE(_dest, '{}');
  -- + @mencionados
  _dest := _dest || COALESCE(NEW.mentions, '{}');
  -- + coordenação (copia_conversas)
  _dest := _dest || COALESCE((SELECT array_agg(id) FROM public.profiles WHERE copia_conversas), '{}');

  _titulo := _autor || ' comentou';

  FOR u IN
    SELECT DISTINCT x FROM unnest(_dest) AS x
    WHERE x IS NOT NULL AND x <> NEW.user_id
  LOOP
    PERFORM public.notificar(u, 'mensagem', 'info', _titulo, _corpo, _link, NULL);
  END LOOP;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_comment_notifica ON public.comments;
CREATE TRIGGER trg_comment_notifica
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_comment_notifica();
