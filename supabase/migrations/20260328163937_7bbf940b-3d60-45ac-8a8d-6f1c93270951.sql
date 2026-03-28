
-- Create a sequence starting from the current max budget_number
DO $$
DECLARE
  max_num integer;
BEGIN
  SELECT COALESCE(MAX(budget_number), 157) INTO max_num FROM public.budgets;
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.budget_number_seq START WITH %s', max_num + 1);
  -- Set the sequence to the correct value
  PERFORM setval('public.budget_number_seq', max_num);
END $$;

-- Update the function to use the sequence instead of MAX
CREATE OR REPLACE FUNCTION public.next_budget_number()
 RETURNS integer
 LANGUAGE sql
 VOLATILE
 SET search_path TO 'public'
AS $function$
  SELECT nextval('public.budget_number_seq')::integer;
$function$;
