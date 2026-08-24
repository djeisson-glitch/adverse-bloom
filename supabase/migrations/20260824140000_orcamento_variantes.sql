-- =========================================================================
-- Variante de orçamento: duas versões do mesmo filme, lado a lado
--
-- Djêisson (24/08/2026): "ter a opção de criar uma versão do mesmo filme pra
-- adicionarmos algumas coisas ou remover e apresentar as duas para o cliente."
--
-- A tabela já tinha `version`, `parent_budget_id` e `is_latest_version` — mas
-- servindo a outra ideia: HISTÓRICO. Versão 2 sucede a 1, e só a última vale
-- (`is_latest_version`). É o que o formulário legado mostra como "3 versões".
--
-- O que ele quer é o contrário disso: duas propostas VIVAS ao mesmo tempo, a
-- mais completa e a enxuta, pro cliente escolher. Uma não sucede a outra.
--
-- Daí `variante_nome`. Preenchido, o orçamento é uma alternativa; NULL, é o
-- principal. Ambas ficam com is_latest_version = true, e é o que permite
-- distinguir "a versão anterior deste orçamento" de "a outra opção que também
-- está na mesa" — que é a diferença entre arquivo e proposta.
-- =========================================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS variante_nome text;

COMMENT ON COLUMN public.budgets.variante_nome IS
  'Rótulo da alternativa ("Com drone", "Enxuta"). NULL = orçamento principal. '
  'Preenchido, é uma opção que coexiste com o principal — não uma versão que o '
  'sucede. Sucessão continua sendo version/is_latest_version.';

-- Duas variantes do mesmo orçamento não podem ter o mesmo rótulo: a tela e a
-- carta do cliente identificam a opção pelo nome, e dois "Opção B" na mesma
-- proposta é ambiguidade na mesa de negociação.
CREATE UNIQUE INDEX IF NOT EXISTS budgets_variante_unica
  ON public.budgets (COALESCE(parent_budget_id, id), variante_nome)
  WHERE variante_nome IS NOT NULL;

-- ---------------------------------------------------------- criar variante
CREATE OR REPLACE FUNCTION public.orcamento_criar_variante(
  _budget_id uuid,
  _nome text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.budgets%ROWTYPE;
  raiz uuid;
  novo uuid;
BEGIN
  SELECT * INTO o FROM public.budgets WHERE id = _budget_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orçamento não encontrado';
  END IF;
  IF _nome IS NULL OR btrim(_nome) = '' THEN
    RAISE EXCEPTION 'a variante precisa de um nome — é como ela aparece pro cliente';
  END IF;

  -- Variante de variante continua pendurada na MESMA raiz. Sem isto, duplicar a
  -- "Opção B" criaria uma árvore, e a terceira opção não apareceria ao lado das
  -- outras duas — apareceria dentro de uma delas.
  raiz := COALESCE(o.parent_budget_id, o.id);

  INSERT INTO public.budgets (
    deal_id, client_id, project_name, client_name, proposal_name,
    status, markup_percent, tax_percent, bv_percent, commission_percent,
    discount, addition, capture_days, project_count,
    margem_produtora_percent, imposto_percent, direcao_cena_percent,
    comissoes, comissao_base, entregas, proposta, not_included,
    categorias_ocultas, notas, internal_notes,
    budget_number, version, is_latest_version,
    parent_budget_id, variante_nome, created_by
  )
  SELECT
    o.deal_id, o.client_id, o.project_name, o.client_name, o.proposal_name,
    'draft', o.markup_percent, o.tax_percent, o.bv_percent, o.commission_percent,
    o.discount, o.addition, o.capture_days, o.project_count,
    o.margem_produtora_percent, o.imposto_percent, o.direcao_cena_percent,
    o.comissoes, o.comissao_base, o.entregas, o.proposta, o.not_included,
    o.categorias_ocultas, o.notas, o.internal_notes,
    o.budget_number, o.version, true,
    raiz, btrim(_nome), o.created_by
  RETURNING id INTO novo;

  -- O que NÃO se copia, e por quê:
  --   public_token  — cada opção precisa do próprio link, senão abrir uma
  --                   mostra a outra;
  --   aprovacoes / aprovada_em / aprovada_por — aprovação é da proposta que o
  --                   cliente leu; nascer aprovada é o pior default possível;
  --   status        — volta a 'draft', porque é uma proposta nova.

  INSERT INTO public.budget_items (
    budget_id, categoria_id, category, item_name, descricao, group_name,
    quantity, unit_type, client_price, client_unit_price, client_days, client_people,
    supplier_cost, supplier_unit_price, supplier_days, supplier_people,
    custo_unitario, has_supplier_cost, diaria, tira_taxa,
    is_deliverable, delivery_duration, delivery_formats,
    observacoes, margin_value, margin_percent, ordem, order_index
  )
  SELECT
    novo, i.categoria_id, i.category, i.item_name, i.descricao, i.group_name,
    i.quantity, i.unit_type, i.client_price, i.client_unit_price, i.client_days, i.client_people,
    i.supplier_cost, i.supplier_unit_price, i.supplier_days, i.supplier_people,
    i.custo_unitario, i.has_supplier_cost, i.diaria, i.tira_taxa,
    i.is_deliverable, i.delivery_duration, i.delivery_formats,
    i.observacoes, i.margin_value, i.margin_percent, i.ordem, i.order_index
  FROM public.budget_items i
  WHERE i.budget_id = _budget_id;

  RETURN novo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.orcamento_criar_variante(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.orcamento_criar_variante(uuid, text) IS
  'Duplica um orçamento como ALTERNATIVA viva (não como versão sucessora), '
  'com todos os itens. Nasce em rascunho, sem token público e sem aprovação.';

-- ------------------------------------------------------- as opções na mesa
CREATE OR REPLACE FUNCTION public.orcamento_variantes(_deal_id uuid)
RETURNS TABLE (
  id uuid, variante_nome text, principal boolean,
  total_value numeric, status text, itens bigint, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id,
         b.variante_nome,
         b.parent_budget_id IS NULL AS principal,
         b.total_value,
         b.status,
         (SELECT count(*) FROM public.budget_items i WHERE i.budget_id = b.id),
         b.created_at
    FROM public.budgets b
   WHERE b.deal_id = _deal_id
     AND b.is_latest_version
   ORDER BY (b.parent_budget_id IS NULL) DESC, b.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.orcamento_variantes(uuid) TO authenticated;
