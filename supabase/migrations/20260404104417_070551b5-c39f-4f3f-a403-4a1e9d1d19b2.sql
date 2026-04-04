
-- 1. CONECTAR projects ao pipeline comercial
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS deal_id      UUID REFERENCES public.deals(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS budget_id    UUID REFERENCES public.budgets(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS invoiced_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_type   TEXT,
  ADD COLUMN IF NOT EXISTS clickup_task_id TEXT;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_billing_status_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_billing_status_check
  CHECK (billing_status IN ('pending', 'partial', 'invoiced', 'paid'));

-- 2. CONECTAR project_costs ao projeto
ALTER TABLE public.project_costs
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- 3. ÍNDICES de performance
CREATE INDEX IF NOT EXISTS idx_projects_deal_id    ON public.projects(deal_id);
CREATE INDEX IF NOT EXISTS idx_projects_budget_id  ON public.projects(budget_id);
CREATE INDEX IF NOT EXISTS idx_projects_billing    ON public.projects(billing_status);
CREATE INDEX IF NOT EXISTS idx_project_costs_proj  ON public.project_costs(project_id);

-- 4. FUNÇÃO RPC: create_project_from_budget
CREATE OR REPLACE FUNCTION public.create_project_from_budget(p_budget_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget  RECORD;
  v_proj_id UUID;
BEGIN
  SELECT
    b.*,
    c.name AS client_display_name
  INTO v_budget
  FROM budgets b
  LEFT JOIN clients c ON c.id = b.client_id
  WHERE b.id = p_budget_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento % não encontrado', p_budget_id;
  END IF;

  SELECT id INTO v_proj_id
  FROM projects
  WHERE budget_id = p_budget_id
  LIMIT 1;

  IF FOUND THEN
    RETURN v_proj_id;
  END IF;

  INSERT INTO projects (
    name, client_id, client_name, status, sold_value, sold_date,
    deal_id, budget_id, contract_value
  )
  VALUES (
    v_budget.project_name,
    v_budget.client_id,
    COALESCE(v_budget.client_name, v_budget.client_display_name, 'Cliente'),
    'briefing',
    v_budget.total_value,
    CURRENT_DATE,
    v_budget.deal_id,
    v_budget.id,
    v_budget.total_value
  )
  RETURNING id INTO v_proj_id;

  UPDATE project_costs
  SET project_id = v_proj_id
  WHERE budget_id = p_budget_id
    AND project_id IS NULL;

  IF v_budget.deal_id IS NOT NULL THEN
    UPDATE deals
    SET stage = 'won', updated_at = NOW()
    WHERE id = v_budget.deal_id
      AND stage NOT IN ('won', 'lost', 'production', 'completed');
  END IF;

  RETURN v_proj_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_project_from_budget(UUID) TO authenticated;

-- 5. VIEW HELPER: pipeline_completo
CREATE OR REPLACE VIEW public.pipeline_completo AS
SELECT
  d.id           AS deal_id,
  d.title        AS deal_title,
  d.stage        AS deal_stage,
  d.value        AS deal_value,
  d.client_id,
  b.id           AS budget_id,
  b.total_value  AS budget_value,
  b.status       AS budget_status,
  b.margin_percent,
  p.id           AS project_id,
  p.name         AS project_name,
  p.status       AS project_status,
  p.billing_status,
  p.contract_value,
  p.invoiced_value,
  p.delivery_date,
  p.direct_costs,
  p.gross_margin_percent,
  p.clickup_task_id,
  p.project_type
FROM deals d
LEFT JOIN budgets b  ON b.deal_id  = d.id AND b.is_latest_version = true
LEFT JOIN projects p ON p.deal_id  = d.id;

GRANT SELECT ON public.pipeline_completo TO authenticated;
