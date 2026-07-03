-- =========================================================================
-- IDs únicos permanentes
--  • Orçamento (deals): numero de 4 dígitos sequencial (0001, 0002, …)
--  • Entregável (deliverables): codigo ADVR-XXXX, começando ACIMA do ClickUp.
--    Último ClickUp em 2026-07-03 = ADVR-3744 → sequência começa em 4000 (folga).
-- Ambos com backfill dos registros existentes e índice único.
-- =========================================================================

-- ---------------- Orçamento: numero 0001, 0002, … ----------------
CREATE SEQUENCE IF NOT EXISTS public.deals_numero_seq START 1;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS numero text;

CREATE OR REPLACE FUNCTION public.tg_deals_numero()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := lpad(nextval('public.deals_numero_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_numero ON public.deals;
CREATE TRIGGER trg_deals_numero
  BEFORE INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_deals_numero();

-- Backfill dos orçamentos já existentes (na ordem de criação)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.deals WHERE numero IS NULL OR numero = '' ORDER BY created_at LOOP
    UPDATE public.deals SET numero = lpad(nextval('public.deals_numero_seq')::text, 4, '0') WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_numero ON public.deals (numero);

-- ---------------- Entregável: codigo ADVR-4000, ADVR-4001, … ----------------
-- Começa em 4000 pra ficar acima do último ClickUp (ADVR-3744) e não conflitar.
CREATE SEQUENCE IF NOT EXISTS public.deliverables_advr_seq START 4000;
ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS codigo text;

CREATE OR REPLACE FUNCTION public.tg_deliverables_codigo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := 'ADVR-' || lpad(nextval('public.deliverables_advr_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deliverables_codigo ON public.deliverables;
CREATE TRIGGER trg_deliverables_codigo
  BEFORE INSERT ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_deliverables_codigo();

-- Backfill dos entregáveis já existentes (na ordem de criação)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.deliverables WHERE codigo IS NULL OR codigo = '' ORDER BY created_at LOOP
    UPDATE public.deliverables SET codigo = 'ADVR-' || lpad(nextval('public.deliverables_advr_seq')::text, 4, '0') WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_deliverables_codigo ON public.deliverables (codigo);
