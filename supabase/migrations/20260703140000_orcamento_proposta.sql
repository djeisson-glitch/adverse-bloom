-- =========================================================================
-- Carta de orçamento (proposta) — campos do documento "INVESTIMENTO" da Adverse
-- que não vêm da planilha: briefing, diárias, equipe, pós, equipamentos,
-- não inclui, validade, condições de pagamento, override de investimento.
-- Guardado num único jsonb pra ficar simples.
-- =========================================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS proposta jsonb NOT NULL DEFAULT '{}'::jsonb;
