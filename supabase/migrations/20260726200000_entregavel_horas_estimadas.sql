-- =========================================================================
-- Horas estimadas no ENTREGÁVEL — a base do planejamento por horas.
--
-- Contexto (Djêisson, 26/07/2026): a produtora trabalha com base em horas
-- pra tudo. No ClickUp a estimativa ficava na tarefa e bloqueava o tempo de
-- quem estava alocado. Aqui a estimativa não existia na peça — só em `tasks`,
-- que quase não se usa (2 abertas). Resultado: Capacidade só media o PASSADO
-- (hora apontada) e Planejamento pedia alocação manual numa tabela paralela
-- que ninguém alimentava (0 linhas).
--
-- Dois problemas que ele levantou, e que o desenho respeita:
--   • a distribuição não segue o plano — peça de 8h com prazo dia 30 não é
--     editada só no dia 30;
--   • a estimativa erra pros dois lados.
-- Nenhum dos dois se resolve chutando um modelo agora: com 28h apontadas no
-- total não há o que aprender. O que dá pra fazer é REGISTRAR O ERRO desde
-- já — estimado × realizado por peça — que é exatamente o histórico que uma
-- correção automática vai precisar depois.
-- =========================================================================

ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS horas_estimadas numeric(6,2);

COMMENT ON COLUMN public.deliverables.horas_estimadas IS
  'Estimativa manual de horas da peça. Base do compromisso de agenda e do histórico estimado x realizado.';

/**
 * Estimado × realizado por peça.
 *
 * `realizado` vem dos apontamentos com deliverable_id — que só passaram a
 * existir hoje, então a série começa agora. `fator` é quanto a estimativa
 * errou: 1.5 = gastou 50% a mais do que se previu.
 */
CREATE OR REPLACE VIEW public.v_entregavel_estimado_real AS
SELECT
  d.id                              AS deliverable_id,
  d.project_id,
  d.titulo,
  d.status,
  d.responsavel_id,
  COALESCE(d.prazo_interno, d.data_entrega) AS prazo,
  d.horas_estimadas,
  COALESCE(h.horas_total, 0)        AS horas_realizadas,
  CASE
    WHEN COALESCE(d.horas_estimadas, 0) > 0 AND COALESCE(h.horas_total, 0) > 0
      THEN ROUND((h.horas_total / d.horas_estimadas)::numeric, 2)
    ELSE NULL
  END                               AS fator
FROM public.deliverables d
LEFT JOIN public.v_horas_entregavel h ON h.deliverable_id = d.id;

/**
 * Compromisso por pessoa: horas ESTIMADAS que ainda não foram entregues.
 *
 * É o "futuro" que faltava — a Capacidade só enxergava hora já apontada.
 * Desconta o que já foi realizado na peça: uma peça de 8h com 6h feitas
 * compromete 2h, não 8. Peça sem estimativa entra como 0 e aparece separada
 * (`sem_estimativa`), pra não fingir que a conta está completa.
 */
CREATE OR REPLACE VIEW public.v_compromisso_pessoa AS
SELECT
  d.responsavel_id                                    AS user_id,
  COUNT(*) FILTER (WHERE d.horas_estimadas IS NULL)   AS pecas_sem_estimativa,
  COUNT(*)                                            AS pecas_abertas,
  COALESCE(SUM(GREATEST(COALESCE(d.horas_estimadas, 0) - COALESCE(h.horas_total, 0), 0)), 0)
                                                      AS horas_a_fazer,
  MIN(COALESCE(d.prazo_interno, d.data_entrega))      AS prazo_mais_proximo
FROM public.deliverables d
LEFT JOIN public.v_horas_entregavel h ON h.deliverable_id = d.id
WHERE d.responsavel_id IS NOT NULL
  AND COALESCE(d.status, '') NOT IN ('aprovado', 'entregue', 'cancelado', 'reprovado', 'arquivado')
GROUP BY d.responsavel_id;

/**
 * Calibração: o quanto a gente erra, por FORMATO de peça.
 *
 * É daqui que sai a correção automática quando houver histórico. Enquanto
 * tiver poucas amostras, serve pra olho humano — e `amostras` deixa claro
 * quando o número ainda não vale nada.
 */
CREATE OR REPLACE VIEW public.v_calibracao_estimativa AS
SELECT
  COALESCE(NULLIF(d.formato, ''), 'sem formato') AS formato,
  COUNT(*)                                       AS amostras,
  ROUND(AVG(d.horas_estimadas)::numeric, 2)      AS media_estimada,
  ROUND(AVG(h.horas_total)::numeric, 2)          AS media_realizada,
  ROUND(AVG(h.horas_total / NULLIF(d.horas_estimadas, 0))::numeric, 2) AS fator_medio
FROM public.deliverables d
JOIN public.v_horas_entregavel h ON h.deliverable_id = d.id
WHERE COALESCE(d.horas_estimadas, 0) > 0
  AND COALESCE(h.horas_total, 0) > 0
GROUP BY 1;

GRANT SELECT ON public.v_entregavel_estimado_real TO authenticated;
GRANT SELECT ON public.v_compromisso_pessoa       TO authenticated;
GRANT SELECT ON public.v_calibracao_estimativa    TO authenticated;
