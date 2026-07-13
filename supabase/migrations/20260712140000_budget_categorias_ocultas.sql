-- =========================================================================
-- Grupos (categorias) ocultos por orçamento
--  • Cada orçamento pode esconder categorias que não usa, pra deixar a
--    planilha só com o que está incluso.
--  • Guarda a lista de IDs de categoria escondidas. A numeração (código) das
--    categorias que ficam NÃO muda — 004 continua 004 mesmo sem a 003.
--  • Categoria oculta some da planilha e sai do cálculo (total/rentabilidade),
--    mas os itens continuam no banco — dá pra reincluir a qualquer momento.
-- =========================================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS categorias_ocultas jsonb NOT NULL DEFAULT '[]'::jsonb;
