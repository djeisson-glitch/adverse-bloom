-- =========================================================================
-- Onda 5E · Página de detalhe do entregável
-- Pedido do Djeisson (2026-07-02): entregável clicável com mais informações
-- e chat próprio. Campos inspirados nos prints de referência (responsável,
-- aprovador, prazos interno/cliente, pasta de renders).
-- =========================================================================

ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS aprovador_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prazo_interno date,
  ADD COLUMN IF NOT EXISTS pasta_renders text;

-- O chat do entregável usa a tabela comments (entity_type = 'deliverable') —
-- entity_type é text livre, coberto pelas policies genéricas já existentes,
-- então não precisa de nova tabela nem policy.

CREATE INDEX IF NOT EXISTS idx_deliverables_aprovador ON public.deliverables (aprovador_id);
