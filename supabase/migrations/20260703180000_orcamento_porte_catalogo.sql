-- =========================================================================
-- Porte do orçamento (médio/grande) + catálogo de itens com valor unitário
--  • budget_item_templates ganha valor_unitario (preço padrão) e no_medio
--    (se o item aparece no orçamento "médio"; "grande" traz tudo)
--  • deals ganham porte (medio | grande)
--  • seed_budget_items(_budget_id, _porte): filtra por porte, puxa o valor
--    unitário do catálogo e nasce com QUANTIDADE 0
-- =========================================================================

ALTER TABLE public.budget_item_templates
  ADD COLUMN IF NOT EXISTS valor_unitario numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_medio boolean NOT NULL DEFAULT false;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS porte text NOT NULL DEFAULT 'grande';   -- medio | grande

-- troca a assinatura (1 → 2 args com default) sem ambiguidade
DROP FUNCTION IF EXISTS public.seed_budget_items(uuid);

CREATE OR REPLACE FUNCTION public.seed_budget_items(_budget_id uuid, _porte text DEFAULT 'grande')
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
    0, 1, t.valor_unitario, 0, false, t.ordem
  FROM public.budget_item_templates t
  JOIN public.budget_categorias c ON c.codigo = t.categoria_codigo
  WHERE _porte <> 'medio' OR t.no_medio = true       -- grande = tudo; médio = só os marcados
  ORDER BY c.ordem, t.ordem;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;
