-- =========================================================================
-- Custo padrão no catálogo de itens
--  • budget_item_templates ganha custo_unitario (o que o item custa de
--    verdade, por padrão).
--  • seed_budget_items passa a copiar esse custo pro budget_items.custo_unitario,
--    então o orçamento novo já nasce com o custo preenchido (quantidade 0).
-- =========================================================================

ALTER TABLE public.budget_item_templates
  ADD COLUMN IF NOT EXISTS custo_unitario numeric NOT NULL DEFAULT 0;

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
     quantity, diaria, client_unit_price, client_price, custo_unitario, tira_taxa, ordem)
  SELECT
    _budget_id, c.id, c.nome, t.descricao, t.descricao,
    0, 1, t.valor_unitario, 0, t.custo_unitario, false, t.ordem
  FROM public.budget_item_templates t
  JOIN public.budget_categorias c ON c.codigo = t.categoria_codigo
  WHERE _porte <> 'medio' OR t.no_medio = true       -- grande = tudo; médio = só os marcados
  ORDER BY c.ordem, t.ordem;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;
