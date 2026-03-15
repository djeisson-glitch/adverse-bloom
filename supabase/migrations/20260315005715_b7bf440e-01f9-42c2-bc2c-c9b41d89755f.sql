
ALTER TABLE public.budget_settings
  ADD COLUMN commission_djeisson_percent numeric NOT NULL DEFAULT 3,
  ADD COLUMN commission_robert_percent numeric NOT NULL DEFAULT 3,
  ADD COLUMN commission_djeisson_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN commission_robert_enabled boolean NOT NULL DEFAULT true;
