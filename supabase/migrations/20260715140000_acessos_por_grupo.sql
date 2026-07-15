-- =========================================================================
-- Acessos por grupo — geridos no painel (Time)
--
--  Decisão: "o painel manda". user_permissions vira a fonte de verdade do que
--  cada pessoa acessa. O papel só SEMEIA os padrões (quando a pessoa entra);
--  depois, o que o admin liga/desliga no painel é exatamente o que vale.
--
--  E o mais importante: pode_ver_dinheiro passa a respeitar as concessões.
--  Antes ela olhava só o papel — então ligar "Financeiro" pra alguém mostrava
--  o menu mas a RLS barrava e a página voltava vazia. Agora ligar um grupo de
--  dinheiro abre os dados de verdade.
-- =========================================================================

-- ---- Semeia os acessos padrão conforme o papel (não sobrescreve nada) ----
CREATE OR REPLACE FUNCTION public.seed_acessos_padrao(_uid uuid, _papel text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mods text[];
BEGIN
  IF _papel IN ('admin', 'manager', 'cliente') THEN
    RETURN;  -- admin vê tudo por papel; cliente é caso à parte (só portal)
  ELSIF _papel = 'produtor' THEN
    mods := ARRAY[
      'inicio','minha_mesa',
      'demandas','leads','orcamentos','clientes','follow_ups',
      'projetos','pauta','pos_producao','calendario',
      'horas','timesheet','capacidade','planejamento','previsao',
      'faturamento','fechamento','contas_fees','relatorios','financeiro',
      'time','fornecedores'
    ];
  ELSE  -- equipe / edicao / operator: execução (mesmo recorte de antes)
    mods := ARRAY['inicio','minha_mesa','projetos','calendario','horas','timesheet','pos_producao'];
  END IF;

  INSERT INTO public.user_permissions (user_id, module, permission)
  SELECT _uid, unnest(mods), 'view'::permission_level
  ON CONFLICT (user_id, module) DO NOTHING;   -- nunca pisa num toggle explícito
END;
$$;

-- ---- Semeia quem já está no sistema (uma vez) ----------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id, role::text AS papel FROM public.user_roles LOOP
    PERFORM public.seed_acessos_padrao(r.user_id, r.papel);
  END LOOP;
END $$;

-- ---- Novos membros já nascem com os padrões do papel --------------------
-- Trigger no user_roles cobre tanto o convite (tg_provisionar_membro) quanto
-- o admin_upsert_membro, sem precisar mexer nas duas funções.
CREATE OR REPLACE FUNCTION public.tg_seed_acessos()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_acessos_padrao(NEW.user_id, NEW.role::text);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_seed_acessos ON public.user_roles;
CREATE TRIGGER trg_seed_acessos
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_acessos();

-- ---- pode_ver_dinheiro: papel de gestão OU concessão a módulo de dinheiro -
-- (a lista de módulos espelha MONEY_MODULES no front — manter em sincronia)
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
           'demandas','leads','orcamentos','clientes','follow_ups','crm','propostas',
           'faturamento','fechamento','contas_fees','relatorios','financeiro','fornecedores'
         )
    );
$$;
GRANT EXECUTE ON FUNCTION public.pode_ver_dinheiro(uuid) TO authenticated;
