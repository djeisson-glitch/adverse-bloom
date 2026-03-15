
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  budget_item_id uuid REFERENCES public.budget_items(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  supplier_doc text,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date,
  status text NOT NULL DEFAULT 'pending',
  sent_to_conta_azul boolean NOT NULL DEFAULT false,
  conta_azul_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (true);
