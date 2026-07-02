-- =========================================================================
-- Onda 5E · Fix da planilha de produção
-- A coluna `unit_price` foi dropada em mar/2026 (20260315003646 renomeou para
-- client_unit_price). O seed e o editor ainda usavam `unit_price` (inexistente)
-- e omitiam `category` (NOT NULL) → planilha não salvava nem populava.
--
-- Correção:
--   • client_unit_price = valor unitário (coluna que existe, NOT NULL default 0)
--   • client_price      = total da linha (qtd × diária × unit) — lido por
--                         Fechamento / Proposta / Cost Entry, mantém tudo coerente
--   • category recebe DEFAULT '' pra nunca mais ser bloqueador
--   • diária padrão = 1 (multiplicador de dias; item começa em R$0 até ter unit)
-- =========================================================================

ALTER TABLE public.budget_items ALTER COLUMN category SET DEFAULT '';

CREATE OR REPLACE FUNCTION public.seed_budget_items(_budget_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inserted int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.budget_items WHERE budget_id = _budget_id) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.budget_items
    (budget_id, categoria_id, category, descricao, item_name,
     quantity, diaria, client_unit_price, client_price, tira_taxa, ordem)
  SELECT
    _budget_id, c.id, c.nome, t.descricao, t.descricao,
    1, 1, 0, 0, false, t.ordem
  FROM public.budget_item_templates t
  JOIN public.budget_categorias c ON c.codigo = t.categoria_codigo
  ORDER BY c.ordem, t.ordem;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;
