
CREATE TABLE public.proposal_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  template_type text NOT NULL DEFAULT 'completa' CHECK (template_type IN ('completa', 'reduzida')),
  
  -- Extra fields filled at generation time
  contact_name text NOT NULL DEFAULT '',
  contact_company text NOT NULL DEFAULT '',
  project_description text,
  tags text[] DEFAULT '{}',
  deliverables jsonb DEFAULT '[]',
  payment_conditions text DEFAULT 'À vista — 30 dias após aprovação',
  validity_days integer DEFAULT 15,
  
  -- Approval data
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'expired')),
  approved_name text,
  approved_email text,
  approved_ip text,
  approved_at timestamp with time zone,
  
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_letters ENABLE ROW LEVEL SECURITY;

-- Authenticated users can CRUD
CREATE POLICY "Authenticated read proposal_letters" ON public.proposal_letters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert proposal_letters" ON public.proposal_letters FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update proposal_letters" ON public.proposal_letters FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete proposal_letters" ON public.proposal_letters FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Public read access for the proposal page (anon users viewing via token)
CREATE POLICY "Anon read by token" ON public.proposal_letters FOR SELECT TO anon USING (true);
-- Anon can update to approve
CREATE POLICY "Anon approve proposal" ON public.proposal_letters FOR UPDATE TO anon USING (status = 'pending') WITH CHECK (status = 'approved');
