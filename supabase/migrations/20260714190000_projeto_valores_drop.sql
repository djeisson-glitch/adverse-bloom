-- =========================================================================
-- ETAPA 2 (destrutiva) — fecha o vazamento
--
--  Depois da etapa 1 e do deploy do frontend novo, estas colunas em `projects`
--  estão MORTAS: ninguém lê (o app lê a view projects_v) e ninguém escreve
--  (as escritas vão pela RPC set_projeto_financeiro). Os dados já foram
--  copiados pra projects_financeiro.
--
--  Enquanto elas existirem, qualquer pessoa logada — inclusive câmera e editor
--  — consegue ler valor vendido e margem de todo projeto direto pela API.
--  É este DROP que fecha isso. Irreversível de propósito.
-- =========================================================================

-- v_custo_equipe_projeto ainda lia o fallback de custo/hora direto de projects.
-- Ele mora na lateral agora — sem isto, o Postgres (com razão) recusa o DROP.
DROP VIEW IF EXISTS public.v_custo_equipe_projeto;
CREATE VIEW public.v_custo_equipe_projeto AS
SELECT
  te.project_id,
  te.user_id,
  p.full_name,
  p.email,
  SUM(te.duration_min) / 60.0 AS horas,
  COALESCE(pc.custo_hora, pf.custo_hora_padrao, 0) AS custo_hora_efetivo,
  (SUM(te.duration_min) / 60.0) * COALESCE(pc.custo_hora, pf.custo_hora_padrao, 0) AS custo
FROM public.time_entries te
JOIN public.profiles p                ON p.id = te.user_id
LEFT JOIN public.profiles_custo pc    ON pc.user_id = te.user_id
LEFT JOIN public.projects_financeiro pf ON pf.project_id = te.project_id
WHERE te.project_id IS NOT NULL
GROUP BY te.project_id, te.user_id, p.full_name, p.email, pc.custo_hora, pf.custo_hora_padrao;
ALTER VIEW public.v_custo_equipe_projeto SET (security_invoker = on);
GRANT SELECT ON public.v_custo_equipe_projeto TO authenticated;

ALTER TABLE public.projects
  DROP COLUMN IF EXISTS gross_margin_value,
  DROP COLUMN IF EXISTS gross_margin_percent,
  DROP COLUMN IF EXISTS sold_value,
  DROP COLUMN IF EXISTS direct_costs,
  DROP COLUMN IF EXISTS contract_value,
  DROP COLUMN IF EXISTS invoiced_value,
  DROP COLUMN IF EXISTS custo_hora_padrao;
