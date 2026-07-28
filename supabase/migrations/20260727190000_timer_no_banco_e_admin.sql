-- =========================================================================
-- Painel de Horas: timer no banco + admin enxerga e ajusta tudo.
--
-- Dois buracos que impediam o painel pedido:
--
--  1) A sessão em andamento vivia SÓ no localStorage do navegador de quem
--     cronometra (TimerContext) — só virava linha em time_entries no STOP.
--     Ninguém conseguia ver o que estava rodando nos outros. E quem fechava
--     o navegador ou trocava de máquina perdia o timer.
--
--  2) RLS de time_entries era "só o seu" nas quatro operações. O admin não
--     via — nem podia corrigir — hora de ninguém.
-- =========================================================================

-- ---- Sessão de timer em andamento --------------------------------------
-- Uma por pessoa: começar de novo substitui a anterior (o app já trata o
-- timer como singleton, e duas sessões abertas seria dado sujo).
CREATE TABLE IF NOT EXISTS public.time_sessions (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id     uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  deliverable_id uuid REFERENCES public.deliverables(id) ON DELETE SET NULL,
  task_id        uuid,
  description    text,
  billable       boolean NOT NULL DEFAULT true,
  start_at       timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_sessions ENABLE ROW LEVEL SECURITY;

-- Cada um manda na própria sessão; quem coordena VÊ todas (é o painel), mas
-- não mexe — parar o timer do outro pela lista seria armadilha.
DROP POLICY IF EXISTS "sessao propria" ON public.time_sessions;
CREATE POLICY "sessao propria" ON public.time_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "sessao leitura gestao" ON public.time_sessions;
CREATE POLICY "sessao leitura gestao" ON public.time_sessions
  FOR SELECT TO authenticated USING (public.pode_admin_notif(auth.uid()));

-- Realtime: o painel vê o timer dos outros começar e parar sem dar refresh.
ALTER TABLE public.time_sessions REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.time_sessions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ---- Admin enxerga e corrige as horas de todo mundo ---------------------
DROP POLICY IF EXISTS "time_entries select gestao" ON public.time_entries;
CREATE POLICY "time_entries select gestao" ON public.time_entries
  FOR SELECT TO authenticated USING (public.pode_admin_notif(auth.uid()));

DROP POLICY IF EXISTS "time_entries update gestao" ON public.time_entries;
CREATE POLICY "time_entries update gestao" ON public.time_entries
  FOR UPDATE TO authenticated
  USING (public.pode_admin_notif(auth.uid())) WITH CHECK (public.pode_admin_notif(auth.uid()));

DROP POLICY IF EXISTS "time_entries delete gestao" ON public.time_entries;
CREATE POLICY "time_entries delete gestao" ON public.time_entries
  FOR DELETE TO authenticated USING (public.pode_admin_notif(auth.uid()));

-- ---- Quem está rodando agora -------------------------------------------
/**
 * Sessões abertas com nome, projeto e peça já resolvidos.
 *
 * Função (e não view) porque precisa de SECURITY DEFINER pra juntar profiles
 * e projects sem esbarrar na RLS de cada uma — e porque assim o filtro de
 * "só gestão vê todo mundo" fica num lugar só.
 */
CREATE OR REPLACE FUNCTION public.horas_rodando_agora()
RETURNS TABLE (
  user_id uuid, pessoa text, project_id uuid, projeto text, cliente text,
  entregavel text, description text, billable boolean, start_at timestamptz, minutos int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id,
         COALESCE(p.full_name, p.email, '—'),
         s.project_id,
         pr.name,
         pr.client_name,
         d.titulo,
         s.description,
         s.billable,
         s.start_at,
         GREATEST(0, EXTRACT(epoch FROM (now() - s.start_at))/60)::int
    FROM public.time_sessions s
    LEFT JOIN public.profiles p    ON p.id = s.user_id
    LEFT JOIN public.projects pr   ON pr.id = s.project_id
    LEFT JOIN public.deliverables d ON d.id = s.deliverable_id
   -- cada um vê a sua; gestão vê todas
   WHERE s.user_id = auth.uid() OR public.pode_admin_notif(auth.uid())
   ORDER BY s.start_at;
$$;

GRANT EXECUTE ON FUNCTION public.horas_rodando_agora() TO authenticated;
