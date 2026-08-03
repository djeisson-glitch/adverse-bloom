-- =========================================================================
-- Meia diária existe
--
-- O Djêisson tentou lançar 0,5 diária ("Projeto de 103k | Assembleia, Doc e
-- banco de imagens") e levou "invalid input syntax for type integer: 0.5".
-- Meio período é rotina em produção — o campo é que estava errado, não o
-- lançamento.
--
-- Edições também viram numeric: não custa nada e evita o mesmo travamento na
-- caixa do lado. A view volta a somar em numeric.
-- =========================================================================

-- A view depende das colunas: precisa sair antes do ALTER e voltar depois.
DROP VIEW IF EXISTS public.client_saldo;

ALTER TABLE public.client_saldo_lancamentos
  ALTER COLUMN diarias TYPE numeric(8,2),
  ALTER COLUMN edicoes TYPE numeric(8,2);

CREATE OR REPLACE VIEW public.client_saldo
WITH (security_invoker = on) AS
SELECT
  client_id,
  COALESCE(SUM(valor),   0)::numeric(14,2) AS valor,
  COALESCE(SUM(edicoes), 0)::numeric(8,2)  AS edicoes,
  COALESCE(SUM(diarias), 0)::numeric(8,2)  AS diarias,
  COUNT(*)::int                            AS lancamentos,
  MAX(data)                                AS ultimo_lancamento
FROM public.client_saldo_lancamentos
GROUP BY client_id;

GRANT SELECT ON public.client_saldo TO authenticated;
