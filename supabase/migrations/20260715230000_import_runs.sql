-- =========================================================================
-- Registro de importações (com reversão)
--
--  Cada importação em massa (ex.: projetos do ClickUp) grava aqui EXATAMENTE
--  o que criou (ids de projetos e de clientes). Reverter = apagar aqueles ids
--  e mais nada — sem caça por heurística, sem risco de levar junto o que não
--  era da importação.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.import_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL,                    -- ex.: 'clickup-projetos'
  criado_em    timestamptz NOT NULL DEFAULT now(),
  payload      jsonb NOT NULL DEFAULT '{}',      -- { project_ids: [], client_ids: [] }
  resumo       jsonb,                            -- contagens do que foi criado
  revertido_em timestamptz
);

ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;
-- Leitura só admin; escrita só pela edge function (service role, sem policy).
DROP POLICY IF EXISTS "import_runs admin read" ON public.import_runs;
CREATE POLICY "import_runs admin read" ON public.import_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
