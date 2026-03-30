
-- Add project_count to budgets with default 1
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS project_count integer NOT NULL DEFAULT 1;

-- Populate project_count from deal_projects where possible
UPDATE public.budgets b
SET project_count = COALESCE(
  (SELECT COUNT(*) FROM public.deal_projects dp WHERE dp.deal_id = b.deal_id),
  1
)
WHERE b.deal_id IS NOT NULL;

-- Remove deal_project_id FK and column from budgets
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_deal_project_id_fkey;
ALTER TABLE public.budgets DROP COLUMN IF EXISTS deal_project_id;

-- Drop deal_projects table
DROP TABLE IF EXISTS public.deal_projects;
