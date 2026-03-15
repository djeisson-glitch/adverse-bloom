
-- Add versioning columns to budgets
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS budget_number integer,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_budget_id uuid REFERENCES public.budgets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_latest_version boolean NOT NULL DEFAULT true;

-- Create unique index on budget_number + version
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_number_version ON public.budgets(budget_number, version);

-- Create function to get next budget number (starting from 158)
CREATE OR REPLACE FUNCTION public.next_budget_number()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(MAX(budget_number), 157) + 1 FROM public.budgets;
$$;
