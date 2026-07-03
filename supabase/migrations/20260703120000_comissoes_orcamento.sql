-- =========================================================================
-- Comissões por pessoa no orçamento (padrão Catalunya "Cálculo do Orçamento").
-- Substitui a "Direção de cena". Cada comissão (nome + % ou R$) entra no total.
--   comissoes:     [{ "nome": "...", "tipo": "%"|"R$", "valor": number }]
--   comissao_base: 'subtotal1' (custo) | 'subtotal2' (custo + margem)
-- =========================================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS comissoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comissao_base text NOT NULL DEFAULT 'subtotal2';
