
-- Add capture_days to budgets
ALTER TABLE public.budgets ADD COLUMN capture_days integer NOT NULL DEFAULT 0;

-- Team members table (including freelancers without login)
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  color text NOT NULL DEFAULT '#3b82f6',
  role_function text,
  user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read team_members" ON public.team_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage team_members" ON public.team_members
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Job allocations table
CREATE TABLE public.job_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid REFERENCES public.budgets(id) ON DELETE CASCADE NOT NULL,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE NOT NULL,
  allocation_date date NOT NULL,
  start_time time,
  end_time time,
  location text,
  description text,
  role_function text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage job_allocations" ON public.job_allocations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Members read own allocations" ON public.job_allocations
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR team_member_id IN (SELECT id FROM public.team_members WHERE user_id = auth.uid())
  );
