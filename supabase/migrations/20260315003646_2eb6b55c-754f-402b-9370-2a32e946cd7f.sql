ALTER TABLE public.budget_items
  ADD COLUMN client_days numeric NOT NULL DEFAULT 1,
  ADD COLUMN client_people numeric NOT NULL DEFAULT 1,
  ADD COLUMN client_unit_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN supplier_days numeric NOT NULL DEFAULT 0,
  ADD COLUMN supplier_people numeric NOT NULL DEFAULT 0,
  ADD COLUMN supplier_unit_price numeric NOT NULL DEFAULT 0;

-- Migrate existing data: copy old fields into new client_ fields
UPDATE public.budget_items SET
  client_days = days,
  client_people = people_count,
  client_unit_price = unit_price;

-- Drop old columns that are now replaced
ALTER TABLE public.budget_items
  DROP COLUMN days,
  DROP COLUMN people_count,
  DROP COLUMN unit_price;