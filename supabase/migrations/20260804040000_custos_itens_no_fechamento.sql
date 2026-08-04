-- =========================================================================
-- As LINHAS de custo precisam chegar na tela do fechamento
--
-- A tela do faturamento mensal lê os dias do jsonb que a
-- `gerar_faturamento_mensal` monta. Acrescentei `custos_itens` na tabela e a
-- tela ia abrir sempre vazia — mesmo com linhas gravadas — porque o jsonb não
-- passa o campo adiante. É exatamente o esquecimento que já aconteceu aqui
-- com `saida_ids` (migration 20260803210000): dado novo na tabela não é dado
-- novo na tela.
--
-- As linhas entram por SUBQUERY, não por LATERAL join: um join com
-- jsonb_array_elements multiplica a linha da saída por item de custo, e aí
-- os SUM(custo_*) e o COUNT(projetos) desta view sairiam multiplicados —
-- trocando um campo faltando por números errados no fechamento.
--
-- Coluna nova entra no FIM: CREATE OR REPLACE VIEW só aceita acrescentar no
-- fim.
-- =========================================================================

CREATE OR REPLACE VIEW public.diarias_por_dia
WITH (security_invoker = on) AS
SELECT
  p.client_id,
  s.data,
  MAX(s.fracao)                              AS fracao,
  COUNT(*)::int                              AS projetos,
  array_agg(DISTINCT s.project_id)           AS project_ids,
  SUM(s.custo_logistica)                     AS custo_logistica,
  SUM(s.custo_alimentacao)                   AS custo_alimentacao,
  SUM(s.custo_hospedagem)                    AS custo_hospedagem,
  array_agg(s.id ORDER BY s.created_at)      AS saida_ids,
  -- Linhas de todas as saídas do dia. Em dia compartilhado são duas saídas;
  -- a tela lança na primeira e mostra o que houver nas duas.
  (SELECT COALESCE(jsonb_agg(i), '[]'::jsonb)
     FROM public.producao_saidas s2
     JOIN public.projects p2 ON p2.id = s2.project_id
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s2.custos_itens, '[]'::jsonb)) i
    WHERE p2.client_id = p.client_id
      AND s2.data = s.data
      AND s2.tipo = 'diaria'
      AND s2.status <> 'cancelada')          AS custos_itens
FROM public.producao_saidas s
JOIN public.projects p ON p.id = s.project_id
WHERE s.tipo = 'diaria' AND s.status <> 'cancelada'
GROUP BY p.client_id, s.data;
