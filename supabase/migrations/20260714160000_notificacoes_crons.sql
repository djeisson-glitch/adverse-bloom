-- =========================================================================
-- Notificações — prazos + agendamentos
--   • notificar_prazos(): roda todo dia de manhã. Avisa o responsável do que
--     vence hoje, vence amanhã ou já atrasou. O dedupe_key inclui a data, então
--     o atrasado é lembrado TODO dia (é isso que a gente quer) sem repetir no
--     mesmo dia.
--   • cron push:   a cada 2 min, empurra o que está pendente (critico/importante).
--   • cron digest: 8h05 (BRT), a IA escreve o "o que importa hoje" de cada um.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.notificar_prazos()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  r    record;
BEGIN
  -- Entregáveis
  FOR r IN
    SELECT d.id, d.titulo, d.responsavel_id, d.project_id, p.name AS proj,
           coalesce(d.prazo_interno, d.data_entrega) AS prazo
      FROM public.deliverables d
      JOIN public.projects p ON p.id = d.project_id
     WHERE d.responsavel_id IS NOT NULL
       AND coalesce(d.status, '') NOT IN ('aprovado', 'entregue', 'cancelado', 'arquivado')
       AND coalesce(d.prazo_interno, d.data_entrega) IS NOT NULL
       AND coalesce(d.prazo_interno, d.data_entrega) <= hoje + 1
  LOOP
    IF r.prazo < hoje THEN
      PERFORM public.notificar(r.responsavel_id, 'prazo_atrasado', 'critico',
        'Atrasado', r.titulo || ' · ' || r.proj,
        '/projetos/' || r.project_id || '/entregaveis/' || r.id,
        'atraso:' || r.id::text || ':' || hoje::text);
    ELSIF r.prazo = hoje THEN
      PERFORM public.notificar(r.responsavel_id, 'prazo_hoje', 'critico',
        'Vence hoje', r.titulo || ' · ' || r.proj,
        '/projetos/' || r.project_id || '/entregaveis/' || r.id,
        'hoje:' || r.id::text || ':' || hoje::text);
    ELSE
      PERFORM public.notificar(r.responsavel_id, 'prazo_amanha', 'importante',
        'Vence amanhã', r.titulo || ' · ' || r.proj,
        '/projetos/' || r.project_id || '/entregaveis/' || r.id,
        'amanha:' || r.id::text || ':' || hoje::text);
    END IF;
  END LOOP;

  -- Tarefas
  FOR r IN
    SELECT t.id, t.title, t.assigned_user_id, t.project_id, t.due_date AS prazo,
           p.name AS proj
      FROM public.tasks t
      LEFT JOIN public.projects p ON p.id = t.project_id
     WHERE t.assigned_user_id IS NOT NULL
       AND coalesce(t.completed, false) = false
       AND t.due_date IS NOT NULL
       AND t.due_date <= hoje + 1
  LOOP
    IF r.prazo < hoje THEN
      PERFORM public.notificar(r.assigned_user_id, 'prazo_atrasado', 'critico',
        'Tarefa atrasada', r.title || coalesce(' · ' || r.proj, ''),
        '/minha-mesa', 'task_atraso:' || r.id::text || ':' || hoje::text);
    ELSIF r.prazo = hoje THEN
      PERFORM public.notificar(r.assigned_user_id, 'prazo_hoje', 'importante',
        'Tarefa vence hoje', r.title || coalesce(' · ' || r.proj, ''),
        '/minha-mesa', 'task_hoje:' || r.id::text || ':' || hoje::text);
    END IF;
  END LOOP;
END;
$$;

-- =========================================================================
-- Agendamentos
-- =========================================================================
DO $$ BEGIN PERFORM cron.unschedule('notificacoes-prazos'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('notificacoes-push');   EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('notificacoes-digest'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Prazos: todo dia às 11h UTC (8h de Brasília). Roda direto no banco.
SELECT cron.schedule(
  'notificacoes-prazos',
  '0 11 * * *',
  $job$ SELECT public.notificar_prazos(); $job$
);

-- Push: a cada 2 minutos, empurra o que está pendente.
SELECT cron.schedule(
  'notificacoes-push',
  '*/2 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://ythmkxudzaoaayxxlgqy.supabase.co/functions/v1/push-enviar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aG1reHVkemFvYWF5eHhsZ3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0MjAsImV4cCI6MjA5NTg4OTQyMH0.Iww1k1QUKqD1EUqi1d8CLSl0Erd_6VHkk3KWKaMowNI',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aG1reHVkemFvYWF5eHhsZ3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0MjAsImV4cCI6MjA5NTg4OTQyMH0.Iww1k1QUKqD1EUqi1d8CLSl0Erd_6VHkk3KWKaMowNI'
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- Digest com IA: 11h05 UTC (8h05 de Brasília), depois dos prazos entrarem.
SELECT cron.schedule(
  'notificacoes-digest',
  '5 11 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://ythmkxudzaoaayxxlgqy.supabase.co/functions/v1/digest-diario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aG1reHVkemFvYWF5eHhsZ3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0MjAsImV4cCI6MjA5NTg4OTQyMH0.Iww1k1QUKqD1EUqi1d8CLSl0Erd_6VHkk3KWKaMowNI',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aG1reHVkemFvYWF5eHhsZ3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0MjAsImV4cCI6MjA5NTg4OTQyMH0.Iww1k1QUKqD1EUqi1d8CLSl0Erd_6VHkk3KWKaMowNI'
    ),
    body := '{}'::jsonb
  );
  $job$
);
