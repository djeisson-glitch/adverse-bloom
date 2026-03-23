
-- Add deal_id to budgets for CRM linkage
ALTER TABLE public.budgets ADD COLUMN deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL;

-- Add not_included jsonb to budgets for "Não Inclui" section
ALTER TABLE public.budgets ADD COLUMN not_included jsonb DEFAULT '[]'::jsonb;

-- Add version_notes to budgets for version history improvements
ALTER TABLE public.budgets ADD COLUMN version_notes text;

-- Create proposal_templates table
CREATE TABLE public.proposal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  markup_default numeric DEFAULT 35,
  tax_default numeric DEFAULT 9.5,
  commission_default numeric DEFAULT 4,
  bv_default numeric DEFAULT 0,
  not_included jsonb DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read proposal_templates" ON public.proposal_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert proposal_templates" ON public.proposal_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update proposal_templates" ON public.proposal_templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete proposal_templates" ON public.proposal_templates FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Create budget_item_suppliers for multiple suppliers per line item
CREATE TABLE public.budget_item_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_item_id uuid NOT NULL REFERENCES public.budget_items(id) ON DELETE CASCADE,
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  unit_price numeric DEFAULT 0,
  days numeric DEFAULT 1,
  people numeric DEFAULT 1,
  total numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.budget_item_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read budget_item_suppliers" ON public.budget_item_suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert budget_item_suppliers" ON public.budget_item_suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update budget_item_suppliers" ON public.budget_item_suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete budget_item_suppliers" ON public.budget_item_suppliers FOR DELETE TO authenticated USING (true);
