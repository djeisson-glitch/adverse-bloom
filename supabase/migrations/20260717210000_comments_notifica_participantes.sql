-- =====================================================================
-- Notificação de mensagens: incluir os PARTICIPANTES da conversa.
-- Antes só o responsável da entidade era avisado — numa conversa de duas
-- pessoas, o vai-e-volta não notificava os dois lados (quem escreve é
-- excluído, e o outro só entrava se fosse o responsável). Agora todo mundo
-- que já comentou na mesma entidade também recebe. Continua sem encher a
-- caixa de terceiros: só quem está na tarefa, na conversa, a coordenação
-- (copia_conversas) e os @mencionados — nunca o autor.
-- =====================================================================

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
  -- + participantes da conversa (quem já comentou nesta entidade) → o chat
  --   passa a notificar os dois lados do vai-e-volta
  _dest := _dest || COALESCE((
    SELECT array_agg(DISTINCT user_id) FROM public.comments
     WHERE entity_type = NEW.entity_type AND entity_id = NEW.entity_id AND user_id IS NOT NULL
  ), '{}');
  -- + @mencionados
  _dest := _dest || COALESCE(NEW.mentions, '{}');
  -- + coordenação (copia_conversas, ex.: Maiara)
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
