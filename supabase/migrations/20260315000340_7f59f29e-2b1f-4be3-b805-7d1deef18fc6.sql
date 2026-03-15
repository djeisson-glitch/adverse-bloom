
-- 1. budget_settings
CREATE TABLE public.budget_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  markup_default numeric NOT NULL DEFAULT 35,
  tax_default numeric NOT NULL DEFAULT 9.5,
  commission_default numeric NOT NULL DEFAULT 4,
  bv_options text[] NOT NULL DEFAULT ARRAY['0','10','15','20'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.budget_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read budget_settings" ON public.budget_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert budget_settings" ON public.budget_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update budget_settings" ON public.budget_settings FOR UPDATE TO authenticated USING (true);

-- 2. budgets
CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL,
  client_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  markup_percent numeric NOT NULL DEFAULT 35,
  tax_percent numeric NOT NULL DEFAULT 9.5,
  bv_percent numeric NOT NULL DEFAULT 0,
  commission_percent numeric NOT NULL DEFAULT 4,
  discount numeric NOT NULL DEFAULT 0,
  addition numeric NOT NULL DEFAULT 0,
  subtotal_1 numeric DEFAULT 0,
  subtotal_2 numeric DEFAULT 0,
  tax_value numeric DEFAULT 0,
  bv_value numeric DEFAULT 0,
  commission_value numeric DEFAULT 0,
  total_value numeric DEFAULT 0,
  margin_value numeric DEFAULT 0,
  margin_percent numeric DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read budgets" ON public.budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert budgets" ON public.budgets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update budgets" ON public.budgets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete budgets" ON public.budgets FOR DELETE TO authenticated USING (true);

-- 3. budget_items
CREATE TABLE public.budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  category text NOT NULL,
  item_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_type text DEFAULT 'unidades',
  client_price numeric NOT NULL DEFAULT 0,
  supplier_cost numeric NOT NULL DEFAULT 0,
  margin_value numeric DEFAULT 0,
  margin_percent numeric DEFAULT 0,
  order_index integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read budget_items" ON public.budget_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert budget_items" ON public.budget_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update budget_items" ON public.budget_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete budget_items" ON public.budget_items FOR DELETE TO authenticated USING (true);

-- 4. project_costs
CREATE TABLE public.project_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  budget_item_id uuid REFERENCES public.budget_items(id) ON DELETE SET NULL,
  category text,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  supplier text,
  payment_date date,
  sent_to_conta_azul boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read project_costs" ON public.project_costs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert project_costs" ON public.project_costs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update project_costs" ON public.project_costs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete project_costs" ON public.project_costs FOR DELETE TO authenticated USING (true);
