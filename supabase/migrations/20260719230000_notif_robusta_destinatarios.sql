-- =====================================================================
-- Notificações mais robustas + destinatários enxutos.
--
--  1) push_tentativas: o push-enviar deixou de marcar como "enviada" quando a
--     entrega FALHA (antes marcava sempre, então falha virava "enviada" e
--     ninguém via). Agora tenta de novo no próximo ciclo; este contador é o
--     limite pra não insistir pra sempre num navegador problemático.
--
--  2) Destinatários da conversa: só quem PARTICIPA. Antes todo membro do
--     projeto era avisado de qualquer comentário em qualquer entregável — o
--     que enchia a caixa de quem não estava naquele assunto. Agora notifica
--     apenas quem já comentou no fio ou foi @mencionado em alguma mensagem
--     dele (+ a coordenação de copia_conversas, ex.: Maiara). Nunca o autor.
-- =====================================================================

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS push_tentativas int NOT NULL DEFAULT 0;

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

  -- Link certo por tipo de entidade (não muda quem recebe).
  IF NEW.entity_type = 'task' THEN
    SELECT project_id INTO _pid FROM public.tasks WHERE id = NEW.entity_id;
    _link := '/projetos/' || COALESCE(_pid::text, '');
  ELSIF NEW.entity_type = 'deliverable' THEN
    SELECT project_id INTO _pid FROM public.deliverables WHERE id = NEW.entity_id;
    _link := '/projetos/' || COALESCE(_pid::text, '') || '/entregaveis/' || NEW.entity_id::text;
  ELSIF NEW.entity_type = 'project' THEN
    _link := '/projetos/' || NEW.entity_id::text;
  ELSIF NEW.entity_type = 'deal' THEN
    _link := '/comercial';
  ELSE
    _link := '/notificacoes';
  END IF;

  -- Destinatários = participantes (quem já comentou) + TODOS os @mencionados
  -- em qualquer mensagem do fio + os mencionados nesta mensagem.
  SELECT COALESCE(array_agg(DISTINCT q.uid), '{}')
    INTO _dest
  FROM (
    SELECT user_id AS uid
      FROM public.comments
     WHERE entity_type = NEW.entity_type AND entity_id = NEW.entity_id AND user_id IS NOT NULL
    UNION
    SELECT unnest(mentions) AS uid
      FROM public.comments
     WHERE entity_type = NEW.entity_type AND entity_id = NEW.entity_id
    UNION
    SELECT unnest(NEW.mentions) AS uid
  ) q
  WHERE q.uid IS NOT NULL;

  -- + coordenação (copia_conversas). É override intencional, não poluição.
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
