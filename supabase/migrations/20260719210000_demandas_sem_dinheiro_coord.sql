-- =========================================================================
-- Demandas sai do conjunto "dinheiro" e entra pra coordenadora.
--
--  A tabela demandas não tem NENHUMA coluna de valor (nome_projeto,
--  solicitante, prazo, entregas, status) e a tela não mostra R$. Estava no
--  grupo de dinheiro por herança do Comercial — falso positivo. Tirar dela:
--   • deixa a coordenadora ver as solicitações sem destravar o financeiro;
--   • corrige a classificação (ver demanda nunca deveria abrir dinheiro).
--
--  Mantém front (MONEY_MODULES) e banco (esta função) em sincronia.
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
           -- 'demandas' saiu daqui: não mostra dinheiro
           'leads','orcamentos','clientes','follow_ups','propostas',
           'faturamento','fechamento','contas_fees','relatorios','financeiro','fornecedores'
         )
    );
$$;
GRANT EXECUTE ON FUNCTION public.pode_ver_dinheiro(uuid) TO authenticated;

-- Coordenadora passa a enxergar as demandas (além de produção).
CREATE OR REPLACE FUNCTION public.seed_acessos_padrao(_uid uuid, _papel text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mods text[];
BEGIN
  IF _papel IN ('admin', 'manager', 'cliente') THEN
    RETURN;
  ELSIF _papel = 'produtor' THEN
    mods := ARRAY[
      'inicio','minha_mesa',
      'demandas','leads','orcamentos','clientes','follow_ups',
      'projetos','pauta','pos_producao','calendario',
      'horas','timesheet','capacidade','planejamento','previsao',
      'faturamento','fechamento','contas_fees','relatorios','financeiro',
      'time','fornecedores'
    ];
  ELSIF _papel = 'coordenadora' THEN
    mods := ARRAY['inicio','minha_mesa','demandas','projetos','pauta','calendario','pos_producao'];
  ELSE  -- equipe / edicao / operator
    mods := ARRAY['inicio','minha_mesa','projetos','calendario','horas','timesheet','pos_producao'];
  END IF;

  INSERT INTO public.user_permissions (user_id, module, permission)
  SELECT _uid, unnest(mods), 'view'::permission_level
  ON CONFLICT (user_id, module) DO NOTHING;
END;
$$;

-- Coordenadoras já existentes recebem o acesso agora (nenhuma pisa em toggle).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.user_roles WHERE role::text = 'coordenadora' LOOP
    PERFORM public.seed_acessos_padrao(r.user_id, 'coordenadora');
  END LOOP;
END $$;
