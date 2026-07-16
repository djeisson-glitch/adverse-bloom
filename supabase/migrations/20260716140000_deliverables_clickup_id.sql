-- Entregáveis importados do ClickUp: âncora pra dedup e reversão (mesmo
-- padrão do projects.clickup_task_id).
ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS clickup_task_id text;
CREATE INDEX IF NOT EXISTS idx_deliverables_clickup
  ON public.deliverables (clickup_task_id) WHERE clickup_task_id IS NOT NULL;
