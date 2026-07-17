-- =====================================================================
-- Nome do projeto passa a sair do NÚMERO DO ORÇAMENTO, não da data.
-- Padrão: [NNNN]_NOME_DO_PROJETO  (NNNN = budget_number, 4 dígitos).
-- Só afeta projetos NOVOS criados a partir de um orçamento — os já
-- existentes/importados ficam como estão. Se o nome do orçamento já vier
-- com um prefixo antigo (#dataAAAAMMDD_ ou [NNNN]_), ele é removido antes.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_project_from_budget(p_budget_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_budget  RECORD;
  v_proj_id UUID;
  v_nome    text;
  ent       jsonb;
  q         int;
  k         int;
  ord       int := 0;
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

  -- Nome-padrão [NNNN]_NOME. Tira prefixo antigo se houver.
  v_nome := regexp_replace(COALESCE(NULLIF(btrim(v_budget.project_name), ''), 'Projeto'),
                           '^(#[0-9]+_|\[[0-9A-Za-z-]+\]_)', '');
  IF v_budget.budget_number IS NOT NULL THEN
    v_nome := '[' || lpad(v_budget.budget_number::text, 4, '0') || ']_' || v_nome;
  END IF;

  INSERT INTO projects (name, client_id, client_name, status, sold_date, deal_id, budget_id)
  VALUES (
    v_nome,
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

  -- entregáveis a partir das entregas do orçamento (expande a quantidade)
  IF v_budget.entregas IS NOT NULL AND jsonb_typeof(v_budget.entregas) = 'array' THEN
    FOR ent IN SELECT value FROM jsonb_array_elements(v_budget.entregas) LOOP
      q := GREATEST(COALESCE(NULLIF(ent->>'quantidade', '')::int, 1), 1);
      FOR k IN 1..q LOOP
        ord := ord + 1;
        INSERT INTO public.deliverables (project_id, titulo, formato, duracao, status, ordem)
        VALUES (
          v_proj_id,
          COALESCE(NULLIF(btrim(ent->>'titulo'), ''), 'Entrega')
            || CASE WHEN q > 1 THEN ' (' || k || '/' || q || ')' ELSE '' END,
          NULLIF(btrim(ent->>'formato'), ''),
          NULLIF(btrim(ent->>'duracao'), ''),
          'pendente',
          ord
        );
      END LOOP;
    END LOOP;
  END IF;

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
