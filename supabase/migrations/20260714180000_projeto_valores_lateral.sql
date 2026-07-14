-- =========================================================================
-- ETAPA 1 (aditiva) — dinheiro do projeto vai pra uma tabela lateral
--
--  Mesmo problema do custo/hora, um andar acima: `projects` PRECISA ficar
--  legível pra equipe (Projetos, Pauta, Pós-produção, Minha mesa leem dela),
--  mas guarda a foto financeira inteira do job na mesma linha:
--    sold_value, direct_costs, contract_value, invoiced_value,
--    gross_margin_value, gross_margin_percent, custo_hora_padrao
--
--  A tela já esconde (canSeeMoney → "—"), mas a API devolve tudo: basta abrir
--  o devtools. Esconder o botão não é segurança.
--
--  RLS é por LINHA, e o Postgres não sabe dizer "essa coluna sim, essa não"
--  por usuário — admin e equipe compartilham o mesmo papel `authenticated`.
--  Então o dado precisa SAIR da tabela aberta.
--
--  Esta migration é 100% aditiva: cria a lateral, copia os dados, publica a
--  view que recompõe e as RPCs de escrita. Nada é derrubado — o sistema segue
--  funcionando igual. O DROP das colunas antigas (que é o que de fato fecha o
--  vazamento) vem na etapa 2, depois que o frontend novo estiver no ar.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.projects_financeiro (
  project_id        uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  sold_value        numeric(12,2) DEFAULT 0,
  direct_costs      numeric(12,2) DEFAULT 0,
  contract_value    numeric(12,2) DEFAULT 0,
  invoiced_value    numeric(12,2) DEFAULT 0,
  custo_hora_padrao numeric(12,2),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  gross_margin_value   numeric GENERATED ALWAYS AS
    (COALESCE(sold_value, 0) - COALESCE(direct_costs, 0)) STORED,
  gross_margin_percent numeric GENERATED ALWAYS AS
    (CASE WHEN COALESCE(sold_value, 0) > 0
          THEN ((COALESCE(sold_value, 0) - COALESCE(direct_costs, 0)) / sold_value * 100)
          ELSE 0 END) STORED
);

INSERT INTO public.projects_financeiro
  (project_id, sold_value, direct_costs, contract_value, invoiced_value, custo_hora_padrao)
SELECT id, sold_value, direct_costs, contract_value, invoiced_value, custo_hora_padrao
FROM public.projects
ON CONFLICT (project_id) DO NOTHING;

ALTER TABLE public.projects_financeiro ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projeto financeiro gestao" ON public.projects_financeiro;
CREATE POLICY "projeto financeiro gestao" ON public.projects_financeiro
  FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro())
  WITH CHECK (public.pode_ver_dinheiro());

-- Todo projeto novo ganha sua linha financeira (zerada) automaticamente.
CREATE OR REPLACE FUNCTION public.tg_projeto_financeiro()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.projects_financeiro (project_id) VALUES (NEW.id)
  ON CONFLICT (project_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_projeto_financeiro ON public.projects;
CREATE TRIGGER tg_projeto_financeiro
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_projeto_financeiro();

-- ---- A view que recompõe (é daqui que o app passa a ler projeto) ---------
-- Colunas de p listadas na mão de propósito: enquanto as antigas ainda
-- existirem, um `p.*` colidiria com as da lateral (nome duplicado).
CREATE OR REPLACE VIEW public.projects_v AS
SELECT
  p.aprovador_n1_id,
  p.aprovador_n2_id,
  p.billing_status,
  p.briefing_consolidado,
  p.budget_id,
  p.clickup_task_id,
  p.client_id,
  p.client_name,
  p.cliente_aprova,
  p.conta_fee_id,
  p.created_at,
  p.deal_id,
  p.delivery_date,
  p.edicao_horas_mapeadas,
  p.edicao_horas_vendidas,
  p.escopo_vendido,
  p.id,
  p.name,
  p.notes,
  p.numero,
  p.objetivos,
  p.observacoes_cliente,
  p.progress,
  p.project_type,
  p.restricoes,
  p.sold_date,
  p.start_date,
  p.status,
  p.workflow_id,
  f.sold_value,
  f.direct_costs,
  f.contract_value,
  f.invoiced_value,
  f.custo_hora_padrao,
  f.gross_margin_value,
  f.gross_margin_percent
FROM public.projects p
LEFT JOIN public.projects_financeiro f ON f.project_id = p.id;

ALTER VIEW public.projects_v SET (security_invoker = on);
GRANT SELECT ON public.projects_v TO authenticated;

-- ---- Views de gestão passam a ler a lateral ------------------------------
DROP VIEW IF EXISTS public.v_rentabilidade_projeto;
CREATE VIEW public.v_rentabilidade_projeto AS
SELECT
  proj.id AS project_id,
  proj.numero,
  proj.name,
  proj.client_name,
  proj.status,
  COALESCE(h.horas_totais, 0)  AS horas,
  COALESCE(f.sold_value, 0)    AS valor,
  COALESCE(f.direct_costs, 0)  AS custos_externos,
  COALESCE(h.custo_interno, 0) AS custo_interno,
  COALESCE(f.direct_costs, 0) + COALESCE(h.custo_interno, 0) AS custo_total,
  COALESCE(f.sold_value, 0)
    - COALESCE(f.direct_costs, 0)
    - COALESCE(h.custo_interno, 0) AS margem,
  CASE
    WHEN COALESCE(f.sold_value, 0) > 0
      THEN ((COALESCE(f.sold_value, 0)
             - COALESCE(f.direct_costs, 0)
             - COALESCE(h.custo_interno, 0))
            / f.sold_value * 100)
    ELSE NULL
  END AS margem_percent
FROM public.projects proj
LEFT JOIN public.projects_financeiro f ON f.project_id = proj.id
LEFT JOIN public.v_horas_por_projeto h ON h.project_id = proj.id;
ALTER VIEW public.v_rentabilidade_projeto SET (security_invoker = on);
GRANT SELECT ON public.v_rentabilidade_projeto TO authenticated;

DROP VIEW IF EXISTS public.pipeline_completo;
CREATE VIEW public.pipeline_completo AS
SELECT
  d.id           AS deal_id,
  d.title        AS deal_title,
  d.stage        AS deal_stage,
  d.value        AS deal_value,
  d.client_id,
  b.id           AS budget_id,
  b.total_value  AS budget_value,
  b.status       AS budget_status,
  b.margin_percent,
  p.id           AS project_id,
  p.name         AS project_name,
  p.status       AS project_status,
  p.billing_status,
  f.contract_value,
  f.invoiced_value,
  p.delivery_date,
  f.direct_costs,
  f.gross_margin_percent,
  p.clickup_task_id,
  p.project_type
FROM public.deals d
LEFT JOIN public.budgets b  ON b.deal_id = d.id AND b.is_latest_version = true
LEFT JOIN public.projects p ON p.deal_id = d.id
LEFT JOIN public.projects_financeiro f ON f.project_id = p.id;
ALTER VIEW public.pipeline_completo SET (security_invoker = on);
GRANT SELECT ON public.pipeline_completo TO authenticated;

-- ---- Escrita do dinheiro do projeto (gestão) -----------------------------
-- NULL = não mexe naquele campo.
CREATE OR REPLACE FUNCTION public.set_projeto_financeiro(
  _project_id uuid,
  _sold_value numeric DEFAULT NULL,
  _direct_costs numeric DEFAULT NULL,
  _contract_value numeric DEFAULT NULL,
  _invoiced_value numeric DEFAULT NULL,
  _custo_hora_padrao numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_ver_dinheiro() THEN
    RAISE EXCEPTION 'Sem permissão para mexer no valor do projeto';
  END IF;

  INSERT INTO public.projects_financeiro AS pf
    (project_id, sold_value, direct_costs, contract_value, invoiced_value, custo_hora_padrao)
  VALUES
    (_project_id, COALESCE(_sold_value, 0), COALESCE(_direct_costs, 0),
     COALESCE(_contract_value, 0), COALESCE(_invoiced_value, 0), _custo_hora_padrao)
  ON CONFLICT (project_id) DO UPDATE SET
    sold_value        = COALESCE(_sold_value,        pf.sold_value),
    direct_costs      = COALESCE(_direct_costs,      pf.direct_costs),
    contract_value    = COALESCE(_contract_value,    pf.contract_value),
    invoiced_value    = COALESCE(_invoiced_value,    pf.invoiced_value),
    custo_hora_padrao = COALESCE(_custo_hora_padrao, pf.custo_hora_padrao),
    updated_at        = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_projeto_financeiro(uuid, numeric, numeric, numeric, numeric, numeric) TO authenticated;

-- Zerar de propósito (o COALESCE acima nunca zera).
CREATE OR REPLACE FUNCTION public.zerar_custo_hora_padrao(_project_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_ver_dinheiro() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  UPDATE public.projects_financeiro
     SET custo_hora_padrao = NULL, updated_at = now()
   WHERE project_id = _project_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.zerar_custo_hora_padrao(uuid) TO authenticated;

-- =========================================================================
-- create_project_from_budget: passa a gravar o dinheiro na lateral.
--
-- E corrige um bug que estava vivo: ela mandava o deal pro estágio 'won', que
-- NÃO existe (os estágios são lead/elaboracao/proposta/negociacao/aceite/
-- fechado_ganho/perdido, e `stage` é text — sem enum pra barrar). Ou seja:
-- gerar o job a partir do orçamento fazia o negócio SUMIR do Kanban comercial,
-- porque nenhuma coluna se chama 'won'.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_project_from_budget(p_budget_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_budget  RECORD;
  v_proj_id UUID;
BEGIN
  SELECT b.*, c.name AS client_display_name
    INTO v_budget
    FROM budgets b
    LEFT JOIN clients c ON c.id = b.client_id
   WHERE b.id = p_budget_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento % não encontrado', p_budget_id;
  END IF;

  SELECT id INTO v_proj_id FROM projects WHERE budget_id = p_budget_id LIMIT 1;
  IF FOUND THEN
    RETURN v_proj_id;
  END IF;

  INSERT INTO projects (name, client_id, client_name, status, sold_date, deal_id, budget_id)
  VALUES (
    v_budget.project_name,
    v_budget.client_id,
    COALESCE(v_budget.client_name, v_budget.client_display_name, 'Cliente'),
    'briefing',
    CURRENT_DATE,
    v_budget.deal_id,
    v_budget.id
  )
  RETURNING id INTO v_proj_id;

  -- o trigger já criou a linha zerada; aqui entra o valor vendido
  UPDATE projects_financeiro
     SET sold_value = v_budget.total_value,
         contract_value = v_budget.total_value,
         updated_at = now()
   WHERE project_id = v_proj_id;

  UPDATE project_costs
     SET project_id = v_proj_id
   WHERE budget_id = p_budget_id AND project_id IS NULL;

  IF v_budget.deal_id IS NOT NULL THEN
    UPDATE deals
       SET stage = 'fechado_ganho', updated_at = NOW()
     WHERE id = v_budget.deal_id
       AND stage NOT IN ('fechado_ganho', 'perdido');
  END IF;

  RETURN v_proj_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_project_from_budget(UUID) TO authenticated;
