-- Diárias/tarefas importadas do ClickUp: âncora pra dedup e reversão.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS clickup_task_id text;
CREATE INDEX IF NOT EXISTS idx_tasks_clickup
  ON public.tasks (clickup_task_id) WHERE clickup_task_id IS NOT NULL;
