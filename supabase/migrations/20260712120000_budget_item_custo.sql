-- =========================================================================
-- Custo real por linha da planilha
--  • Cada linha ganha custo_unitario (o que aquela linha CUSTA de verdade).
--  • Custo da linha = quantity × diaria × custo_unitario  (mesma conta do
--    valor cobrado, só que com o custo).
--  • Rentabilidade real = margem da produtora + Σ(valor cobrado − custo real).
--    Comissão e imposto são pass-through (o cliente paga e a produtora repassa),
--    então não entram na rentabilidade.
-- =========================================================================

ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS custo_unitario numeric NOT NULL DEFAULT 0;
