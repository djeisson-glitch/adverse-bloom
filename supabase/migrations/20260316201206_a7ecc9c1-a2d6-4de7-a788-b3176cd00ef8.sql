
CREATE TABLE public.supplier_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  document TEXT,
  type TEXT DEFAULT 'individual',
  is_generic BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read supplier_contacts" ON public.supplier_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert supplier_contacts" ON public.supplier_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update supplier_contacts" ON public.supplier_contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete supplier_contacts" ON public.supplier_contacts FOR DELETE TO authenticated USING (true);
