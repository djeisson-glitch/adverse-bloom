-- =========================================================================
-- "Este nível PEDIU AJUSTE" — separar aprovou de pediu-ajuste no badge.
--
-- O badge de cada revisão (R1/R2) pintava de verde sempre que
-- `aprovado_nX_em` estava preenchido. Mas o fluxo grava esse timestamp nos
-- DOIS casos: quando o revisor aprova E quando pede ajuste (pra registrar que
-- ele agiu). Resultado: quem pediu ajuste aparecia como se tivesse aprovado.
--
-- Estas flags guardam a última ação de cada nível no ciclo atual. Zeram
-- quando a peça volta pra revisão (ciclo novo) — ver enviarParaRevisao.
-- =========================================================================
alter table public.deliverables
  add column if not exists rev_n1_ajuste boolean not null default false,
  add column if not exists rev_n2_ajuste boolean not null default false;
