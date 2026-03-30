
-- Create deal_projects table
CREATE TABLE public.deal_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  name text NOT NULL,
  delivery_type text NOT NULL DEFAULT 'Institucional',
  value numeric DEFAULT 0,
  internal_cost numeric DEFAULT 0,
  margin_value numeric DEFAULT 0,
  margin_percent numeric DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deal_projects ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated read deal_projects" ON public.deal_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert deal_projects" ON public.deal_projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update deal_projects" ON public.deal_projects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete deal_projects" ON public.deal_projects FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Add deal_project_id to budgets
ALTER TABLE public.budgets ADD COLUMN deal_project_id uuid REFERENCES public.deal_projects(id) ON DELETE SET NULL;

-- Migrate existing budgets: create a deal_project for each budget that has a deal_id
INSERT INTO public.deal_projects (deal_id, name, delivery_type, value, internal_cost, margin_value, margin_percent)
SELECT 
  b.deal_id,
  b.project_name,
  'Institucional',
  COALESCE(b.total_value, 0),
  COALESCE(b.subtotal_1, 0) - COALESCE(b.margin_value, 0),
  COALESCE(b.margin_value, 0),
  COALESCE(b.margin_percent, 0)
FROM public.budgets b
WHERE b.deal_id IS NOT NULL AND b.is_latest_version = true;

-- Link existing budgets to their new deal_projects
UPDATE public.budgets b
SET deal_project_id = dp.id
FROM public.deal_projects dp
WHERE b.deal_id = dp.deal_id 
  AND b.project_name = dp.name 
  AND b.deal_project_id IS NULL
  AND b.is_latest_version = true;
