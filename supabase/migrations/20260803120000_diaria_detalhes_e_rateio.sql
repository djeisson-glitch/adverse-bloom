-- =========================================================================
-- Diária: meia ou cheia, custos do dia, e um dia é um dia
--
-- Pedido do Djêisson (03/08/2026), três coisas que faltavam:
--
--  1. Detalhe: quem participa (já existia em `equipe`, mas sem fração) e se
--     a diária é TOTAL ou meia.
--
--  2. Um dia é UM dia. "às vezes temos mais de um projeto gravado no mesmo
--     dia" — hoje isso vira duas diárias na conta do cliente, e ele paga por
--     duas. A equipe saiu uma vez.
--
--  3. Custos do dia: logística (carro, combustível), alimentação e
--     hospedagem — repassados com margem de 15% (menor que a padrão) e o
--     imposto do cliente por cima.
--
-- A regra do rateio, em uma frase: por CLIENTE e por DIA, vale a MAIOR
-- fração agendada. Dois projetos do mesmo cliente no dia 21, um cheio e um
-- meio, contam 1 diária — não 1,5, não 2. Cliente diferente no mesmo dia é
-- outra diária, porque foi outra saída (ou foi um dia puxado, e isso é
-- problema de escala, não de cobrança).
-- =========================================================================

ALTER TABLE public.producao_saidas
  ADD COLUMN IF NOT EXISTS fracao            numeric(4,2)  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS custo_logistica   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_alimentacao numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_hospedagem  numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.producao_saidas.fracao IS
  'Quanto do dia a diária ocupa: 1 = cheia, 0.5 = meia. Conta na franquia e na cobrança.';
COMMENT ON COLUMN public.producao_saidas.custo_logistica IS
  'Aluguel de carro, combustível, pedágio — o que foi gasto pra chegar lá.';

DO $ck$
BEGIN
  ALTER TABLE public.producao_saidas
    ADD CONSTRAINT producao_saidas_fracao_ck CHECK (fracao > 0 AND fracao <= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $ck$;

/**
 * Diárias por cliente e por dia — a verdade da contagem.
 *
 * `projetos` guarda quantos projetos dividiram o dia: é o que permite a tela
 * avisar "essa diária é compartilhada" em vez de o cliente descobrir na
 * fatura.
 */
CREATE OR REPLACE VIEW public.diarias_por_dia
WITH (security_invoker = on) AS
SELECT
  p.client_id,
  s.data,
  MAX(s.fracao)                              AS fracao,      -- um dia é um dia
  COUNT(*)::int                              AS projetos,
  array_agg(DISTINCT s.project_id)           AS project_ids,
  SUM(s.custo_logistica)                     AS custo_logistica,
  SUM(s.custo_alimentacao)                   AS custo_alimentacao,
  SUM(s.custo_hospedagem)                    AS custo_hospedagem
FROM public.producao_saidas s
JOIN public.projects p ON p.id = s.project_id
WHERE s.tipo = 'diaria' AND s.status <> 'cancelada'
GROUP BY p.client_id, s.data;

GRANT SELECT ON public.diarias_por_dia TO authenticated;

/**
 * Quanto de diária o cliente consumiu num período — já com o dia contado uma
 * vez só. Substitui o COUNT(*) que o fechamento usava.
 */
CREATE OR REPLACE FUNCTION public.diarias_consumidas(_client uuid, _ini date, _fim date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(fracao), 0)
  FROM public.diarias_por_dia
  WHERE client_id = _client AND data >= _ini AND data < _fim;
$$;
GRANT EXECUTE ON FUNCTION public.diarias_consumidas(uuid, date, date) TO authenticated;

-- ---------- Margem das diárias: 15%, menor que a de produção ----------
ALTER TABLE public.client_faturamento
  ADD COLUMN IF NOT EXISTS margem_diaria_percent numeric(6,2) NOT NULL DEFAULT 15;
COMMENT ON COLUMN public.client_faturamento.margem_diaria_percent IS
  'Margem sobre os custos de diária (logística, alimentação, hospedagem). Menor que a de produção — é repasse, não trabalho.';
