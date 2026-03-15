ALTER TABLE public.budget_items
  ADD COLUMN days numeric NOT NULL DEFAULT 1,
  ADD COLUMN people_count numeric NOT NULL DEFAULT 1,
  ADD COLUMN unit_price numeric NOT NULL DEFAULT 0;