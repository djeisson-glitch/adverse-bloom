-- =====================================================================
-- Fluxo do entregável: flag de RETRABALHO.
-- Quando um entregável recebe um AJUSTE INTERNO (revisor pediu) ou uma
-- ALTERAÇÃO DO CLIENTE, ele passa a rodar em "revisão única" (1 revisão
-- interna antes de voltar pro cliente) em vez do fluxo N1→N2 completo —
-- pra evitar muito retrabalho. A flag marca esse "segundo fluxo".
-- =====================================================================

ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS retrabalho boolean NOT NULL DEFAULT false;
