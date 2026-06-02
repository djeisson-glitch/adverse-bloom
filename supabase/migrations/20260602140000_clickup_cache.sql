-- ============================================================================
-- Cache de dados do ClickUp (projetos finalizados → ticket médio / realizados).
-- Escrito só pela edge function (service_role); lido por autenticados.
-- ============================================================================

CREATE TABLE public.clickup_cache (
  data_type  TEXT PRIMARY KEY,
  payload    JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clickup_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read clickup_cache"
  ON public.clickup_cache FOR SELECT TO authenticated USING (true);
-- Escrita só via service_role (edge function) — sem policy de insert/update.
