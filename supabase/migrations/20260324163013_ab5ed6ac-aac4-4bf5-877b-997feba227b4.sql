-- 1. Add trade_name to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS trade_name text;

-- 2. Create budget_preset_items table for reusable items
CREATE TABLE IF NOT EXISTS public.budget_preset_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  item_name text NOT NULL,
  client_days numeric NOT NULL DEFAULT 1,
  client_people numeric NOT NULL DEFAULT 1,
  client_unit_price numeric NOT NULL DEFAULT 0,
  has_supplier_cost boolean NOT NULL DEFAULT false,
  supplier_days numeric NOT NULL DEFAULT 0,
  supplier_people numeric NOT NULL DEFAULT 0,
  supplier_unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.budget_preset_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read budget_preset_items" ON public.budget_preset_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert budget_preset_items" ON public.budget_preset_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update budget_preset_items" ON public.budget_preset_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete budget_preset_items" ON public.budget_preset_items FOR DELETE TO authenticated USING (true);