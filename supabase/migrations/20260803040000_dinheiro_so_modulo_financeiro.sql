-- =========================================================================
-- Ver "demandas" não pode dar a chave do cofre
--
-- O Djêisson pediu garantia de que editor não vê valor. Fui medir e a
-- resposta honesta era: hoje não vê, mas por sorte, não por desenho.
--
-- `pode_ver_dinheiro` liberava tudo pra quem tivesse permissão em QUALQUER
-- um destes módulos:
--
--   demandas, leads, orcamentos, clientes, follow_ups, propostas,
--   faturamento, fechamento, contas_fees, relatorios, financeiro, fornecedores
--
-- Cinco deles não são dinheiro. "Ver demandas" é a coisa mais inócua do
-- sistema — e dava tabela de preço, fechamento, fatura e valor de projeto.
-- Medido em 02/08/2026: a Maiara (coordenadora) tem exatamente uma permissão,
-- `demandas: view`, e por causa dela enxerga todo o financeiro. Nenhum dos
-- quatro editores tem permissão nesses módulos, então hoje eles não veem
-- nada. Mas bastaria alguém dar "demandas: view" ao José.
--
-- A lista passa a ser só o que é dinheiro de fato. Papéis não mudam: admin e
-- manager continuam vendo tudo.
--
-- EFEITO COLATERAL CONHECIDO: a Maiara perde o acesso ao financeiro até
-- ganhar uma permissão de módulo financeiro (ex.: `faturamento: view`), pelo
-- painel de permissões. É intencional — melhor conceder de propósito do que
-- herdar sem querer.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.pode_ver_dinheiro(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = _uid AND role::text IN ('admin', 'manager')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
       WHERE user_id = _uid
         AND permission <> 'none'
         AND module IN (
           -- Só módulos onde o dinheiro É o conteúdo.
           -- Fora da lista de propósito: demandas, leads, clientes,
           -- follow_ups — trabalhar com eles não implica ver valor.
           'orcamentos', 'propostas', 'faturamento', 'fechamento',
           'contas_fees', 'relatorios', 'financeiro', 'fornecedores'
         )
    );
$$;
GRANT EXECUTE ON FUNCTION public.pode_ver_dinheiro(uuid) TO authenticated;
