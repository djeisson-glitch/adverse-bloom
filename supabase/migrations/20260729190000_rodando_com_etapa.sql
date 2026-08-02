-- Quem está rodando mostra EM QUE ETAPA está.
--
-- A etapa já vive na peça e já é carimbada em cada hora; faltava aparecer
-- enquanto o trabalho acontece. Sem isso, "quem está fazendo o quê agora" só
-- era respondível depois — no relatório, nunca no momento em que a resposta
-- muda uma decisão.
--
-- RETURNS TABLE muda, então precisa de DROP antes.
DROP FUNCTION IF EXISTS public.horas_rodando_agora();

CREATE FUNCTION public.horas_rodando_agora()
RETURNS TABLE (
  user_id uuid, pessoa text, project_id uuid, projeto text, cliente text,
  deliverable_id uuid, entregavel text, description text, billable boolean,
  start_at timestamptz, minutos int, etapa text, etapa_nome text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id,
         COALESCE(p.full_name, p.email, '—'),
         s.project_id,
         pr.name,
         pr.client_name,
         s.deliverable_id,
         d.titulo,
         s.description,
         s.billable,
         s.start_at,
         GREATEST(0, EXTRACT(epoch FROM (now() - s.start_at))/60)::int,
         d.etapa_atual,
         e.nome
    FROM public.time_sessions s
    LEFT JOIN public.profiles p     ON p.id = s.user_id
    LEFT JOIN public.projects pr    ON pr.id = s.project_id
    LEFT JOIN public.deliverables d ON d.id = s.deliverable_id
    LEFT JOIN public.etapas_pos e   ON e.slug = d.etapa_atual
   WHERE s.user_id = auth.uid() OR public.pode_admin_notif(auth.uid())
   ORDER BY s.start_at;
$$;

GRANT EXECUTE ON FUNCTION public.horas_rodando_agora() TO authenticated;
