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
ALTER TABLE public.projects
  DROP COLUMN IF EXISTS gross_margin_value,
  DROP COLUMN IF EXISTS gross_margin_percent,
  DROP COLUMN IF EXISTS sold_value,
  DROP COLUMN IF EXISTS direct_costs,
  DROP COLUMN IF EXISTS contract_value,
  DROP COLUMN IF EXISTS invoiced_value,
  DROP COLUMN IF EXISTS custo_hora_padrao;
