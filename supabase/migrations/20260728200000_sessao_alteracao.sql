-- A sessão do cronômetro precisa lembrar QUAL alteração está sendo trabalhada.
-- Sem isso, quem fecha o navegador no meio de um ajuste do cliente volta com o
-- cronômetro rodando mas amarrado à edição normal — e a hora cai no balde
-- errado justamente no caso que a produtora mais precisa medir (retrabalho).
ALTER TABLE public.time_sessions
  ADD COLUMN IF NOT EXISTS alteracao_id uuid
    REFERENCES public.deliverable_alteracoes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.time_sessions.alteracao_id IS
  'Alteração do cliente em que a hora está sendo contada. NULL = edição normal.';
