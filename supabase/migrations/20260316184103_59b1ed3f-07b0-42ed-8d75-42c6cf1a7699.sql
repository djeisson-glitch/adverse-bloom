
CREATE TABLE public.budget_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  annual_target NUMERIC NOT NULL DEFAULT 1500000,
  q1_percent NUMERIC NOT NULL DEFAULT 25,
  q2_percent NUMERIC NOT NULL DEFAULT 25,
  q3_percent NUMERIC NOT NULL DEFAULT 25,
  q4_percent NUMERIC NOT NULL DEFAULT 25,
  auto_calculated BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(year)
);

ALTER TABLE public.budget_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read budget_targets" ON public.budget_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert budget_targets" ON public.budget_targets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update budget_targets" ON public.budget_targets FOR UPDATE TO authenticated USING (true);

INSERT INTO public.budget_targets (year, annual_target, q1_percent, q2_percent, q3_percent, q4_percent)
VALUES (2026, 1500000, 22, 24, 19, 35);
