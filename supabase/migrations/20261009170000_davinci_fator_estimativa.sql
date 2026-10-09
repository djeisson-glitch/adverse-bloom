BEGIN;
-- A duração medida permanece intacta, inclusive em custos e relatórios.
ALTER TABLE public.time_entries ADD COLUMN time_multiplier numeric(4,2) NOT NULL DEFAULT 1 CHECK (time_multiplier > 0);
UPDATE public.time_entries SET time_multiplier = 1.25 WHERE source = 'davinci';
CREATE FUNCTION public.tg_davinci_fator_estimativa() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.time_multiplier := CASE WHEN NEW.source = 'davinci' THEN 1.25 ELSE 1 END;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_davinci_fator_estimativa BEFORE INSERT OR UPDATE OF source ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.tg_davinci_fator_estimativa();
COMMIT;
