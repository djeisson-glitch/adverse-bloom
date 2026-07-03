-- =========================================================================
-- Escopo de entregas no orçamento — pra produção executiva, produtor e direção
-- saberem o que está incluso (qtd de entregas, formato, duração, diárias).
--   entregas: [{ "titulo": "...", "formato": "...", "duracao": "...",
--                "quantidade": number, "diarias": number }]
-- =========================================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS entregas jsonb NOT NULL DEFAULT '[]'::jsonb;
