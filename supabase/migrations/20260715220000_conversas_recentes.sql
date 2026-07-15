-- =========================================================================
-- Conversas recentes da pessoa — pro assistente flutuante virar também a
-- caixa de conversas dos projetos (falar com o time interno de qualquer tela).
--
--  Traz as threads (comments) mais recentes RELEVANTES pra quem chama: onde a
--  pessoa comentou, foi @mencionada, é responsável pelo entregável, ou é
--  membro do projeto / dona da tarefa. Com título, prévia da última mensagem
--  e autor.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.conversas_recentes(_limite int DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  res jsonb;
BEGIN
  IF uid IS NULL THEN RETURN '[]'::jsonb; END IF;

  WITH threads AS (
    SELECT c.entity_type, c.entity_id,
           max(c.created_at) AS ultimo_em,
           count(*)          AS n_msgs,
           bool_or(c.user_id = uid)       AS eu_comentei,
           bool_or(uid = ANY(c.mentions)) AS mencionado
      FROM public.comments c
     GROUP BY c.entity_type, c.entity_id
  ),
  relevantes AS (
    SELECT t.*
      FROM threads t
     WHERE t.eu_comentei OR t.mencionado
        OR (t.entity_type = 'deliverable' AND EXISTS (
              SELECT 1 FROM public.deliverables d
               WHERE d.id = t.entity_id
                 AND (d.responsavel_id = uid
                      OR EXISTS (SELECT 1 FROM public.project_members pm
                                  WHERE pm.project_id = d.project_id AND pm.user_id = uid))))
        OR (t.entity_type = 'project' AND EXISTS (
              SELECT 1 FROM public.project_members pm
               WHERE pm.project_id = t.entity_id AND pm.user_id = uid))
        OR (t.entity_type = 'task' AND EXISTS (
              SELECT 1 FROM public.tasks tk WHERE tk.id = t.entity_id AND tk.assigned_user_id = uid))
     ORDER BY t.ultimo_em DESC
     LIMIT _limite
  )
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.ultimo_em DESC), '[]'::jsonb) INTO res
  FROM (
    SELECT
      r.entity_type, r.entity_id, r.ultimo_em, r.n_msgs,
      CASE r.entity_type
        WHEN 'deliverable' THEN (SELECT d.titulo FROM public.deliverables d WHERE d.id = r.entity_id)
        WHEN 'project'     THEN (SELECT p.name   FROM public.projects p     WHERE p.id = r.entity_id)
        WHEN 'task'        THEN (SELECT tk.title FROM public.tasks tk        WHERE tk.id = r.entity_id)
        WHEN 'deal'        THEN (SELECT dl.title FROM public.deals dl        WHERE dl.id = r.entity_id)
        ELSE 'Conversa' END AS titulo,
      CASE r.entity_type
        WHEN 'deliverable' THEN (SELECT p.name FROM public.deliverables d JOIN public.projects p ON p.id = d.project_id WHERE d.id = r.entity_id)
        WHEN 'task'        THEN (SELECT p.name FROM public.tasks tk        JOIN public.projects p ON p.id = tk.project_id WHERE tk.id = r.entity_id)
        ELSE NULL END AS projeto,
      (SELECT c2.body FROM public.comments c2
        WHERE c2.entity_type = r.entity_type AND c2.entity_id = r.entity_id
        ORDER BY c2.created_at DESC LIMIT 1) AS ultimo_body,
      (SELECT pr.full_name FROM public.comments c2 LEFT JOIN public.profiles pr ON pr.id = c2.user_id
        WHERE c2.entity_type = r.entity_type AND c2.entity_id = r.entity_id
        ORDER BY c2.created_at DESC LIMIT 1) AS ultimo_autor
    FROM relevantes r
  ) x;

  RETURN res;
END;
$$;
GRANT EXECUTE ON FUNCTION public.conversas_recentes(int) TO authenticated;
