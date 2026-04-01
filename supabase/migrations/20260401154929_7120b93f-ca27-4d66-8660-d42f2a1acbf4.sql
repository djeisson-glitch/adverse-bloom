ALTER TABLE public.budget_items ADD COLUMN delivery_formats text[] DEFAULT '{}';
ALTER TABLE public.budget_items ADD COLUMN delivery_duration text DEFAULT NULL;