-- =========================================================================
-- RLS por papel — o portão de verdade
--
--  Até aqui, TODAS as tabelas comerciais/financeiras eram
--  "FOR SELECT TO authenticated USING (true)": qualquer pessoa logada lia (e
--  escrevia) todos os orçamentos, deals, faturas e custos pela API — mesmo com
--  o menu escondido. Esconder o botão não é segurança.
--
--  Agora: só admin / manager (legado) / produtor acessam o lado do dinheiro.
--  Equipe, Edição e Cliente ficam de fora — no banco, não só na tela.
--
--  As páginas que a equipe usa (Projetos, Pauta, Calendário, Horas, Timesheet,
--  Pós-Produção, Minha mesa) leem projects/tasks/deliverables/time_entries/
--  profiles/comments/approval_settings — que continuam abertas. As consultas a
--  tabela travada simplesmente voltam vazias (RLS filtra linha, não dá erro).
-- =========================================================================

-- ---- Quem enxerga o lado do dinheiro ------------------------------------
CREATE OR REPLACE FUNCTION public.pode_ver_dinheiro(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _uid
       AND role::text IN ('admin', 'manager', 'produtor')
  );
$$;
GRANT EXECUTE ON FUNCTION public.pode_ver_dinheiro(uuid) TO authenticated;

-- ---- Trava as tabelas comerciais/financeiras ----------------------------
DO $$
DECLARE
  t   text;
  pol record;
  tabelas text[] := ARRAY[
    -- orçamento
    'budgets','budget_items','budget_categorias','budget_composicao_horas',
    'budget_custos_diretos','budget_item_suppliers','budget_item_templates',
    'budget_preset_items','budget_settings','budget_targets','orcamento_padroes',
    -- comercial
    'deals','deal_projects','leads','lead_interacoes','clients','demandas',
    'follow_ups','commercial_settings','proposals','proposal_letters','proposal_templates',
    -- dinheiro
    'invoices','contas_fees','contratos_recorrentes','project_closures',
    'project_costs','project_costs_lancados','rate_card',
    -- fornecedores e caches de gestão
    'suppliers','supplier_contacts','empresa_contexto','conta_azul_cache',
    'clickup_cache','workflows','job_allocations'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;   -- tabela não existe nesse ambiente
    END IF;

    -- derruba as policies antigas (as permissivas USING(true))
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "gestao_%s" ON public.%I FOR ALL TO authenticated '
      'USING (public.pode_ver_dinheiro()) WITH CHECK (public.pode_ver_dinheiro())',
      t, t
    );
  END LOOP;
END $$;

-- ---- Views: sem security_invoker elas BYPASSAM a RLS --------------------
-- Uma view roda com os direitos do dono por padrão — ou seja, a equipe leria
-- custo/rentabilidade pela view mesmo com as tabelas travadas. Com
-- security_invoker=on, a view respeita a RLS de quem está consultando.
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'pipeline_completo','v_capacidade_semana','v_custo_equipe_projeto',
    'v_horas_entregavel','v_horas_por_projeto','v_horas_projeto_total',
    'v_previsao_pipeline','v_rentabilidade_projeto'
  ] LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v);
    END IF;
  END LOOP;
END $$;
