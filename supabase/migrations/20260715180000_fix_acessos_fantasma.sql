-- =========================================================================
-- FIX GRAVE — concessões-fantasma davam dinheiro + admin a quem não devia
--
--  Sintoma: uma conta Equipe via o Financeiro no Início (números reais) e
--  acessava o Admin, mesmo com o menu mostrando só Produção/Tempo.
--
--  Causa: user_permissions tinha concessões a módulos LEGADOS que não são
--  geridos pelo painel de acessos e não aparecem no menu — em especial 'crm'
--  (que está na lista de dinheiro) e 'admin'. O can()/canSeeMoney e a
--  pode_ver_dinheiro honravam essas linhas, então a conta via financeiro (crm)
--  e o painel de administração (admin) por baixo dos panos.
--
--  Correção em duas pontas (a de código já foi):
--   1) Apaga toda concessão a módulo que NÃO é gerido pelo painel.
--   2) pode_ver_dinheiro deixa de considerar 'crm' (legado).
-- =========================================================================

-- ---- 1) Limpa as concessões-fantasma (módulos fora do painel) ------------
-- Managed = BASE (inicio, minha_mesa) + todos os módulos dos grupos do painel
-- + portal (cliente). Qualquer outro (crm, admin, producao, agenda, …) é lixo
-- que só abre acesso escondido.
DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.user_permissions
   WHERE module NOT IN (
     'inicio','minha_mesa',
     'demandas','orcamentos','propostas','clientes','leads','follow_ups',
     'projetos','calendario','pos_producao','pauta',
     'horas','timesheet','capacidade','planejamento','previsao',
     'faturamento','fechamento','financeiro','relatorios','contas_fees',
     'time','fornecedores',
     'portal'
   );
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'concessões-fantasma removidas: %', n;
END $$;

-- ---- 2) pode_ver_dinheiro sem o legado 'crm' -----------------------------
CREATE OR REPLACE FUNCTION public.pode_ver_dinheiro(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = _uid AND role::text IN ('admin', 'manager', 'produtor')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
       WHERE user_id = _uid
         AND permission <> 'none'
         AND module IN (
           'demandas','leads','orcamentos','clientes','follow_ups','propostas',
           'faturamento','fechamento','contas_fees','relatorios','financeiro','fornecedores'
         )
    );
$$;
GRANT EXECUTE ON FUNCTION public.pode_ver_dinheiro(uuid) TO authenticated;
