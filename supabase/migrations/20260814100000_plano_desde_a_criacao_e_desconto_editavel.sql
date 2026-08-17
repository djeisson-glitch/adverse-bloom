-- =========================================================================
-- Avulso ou plano JÁ na criação; e o desconto vira campo editável
--
-- Djêisson (14/08/2026): "se eu clicar pra criar um novo orçamento aqui, nao
-- aparece a opcão de eu selecionar se quero avulso ou montar um plano...
-- sobre o desconto progressivo, quero q deixe um campo pra ele e que a gente
-- possa editar quando quiser."
--
-- Os dois são falha minha de onde parei. Pus o seletor só no EDITOR, mas o
-- orçamento começa na tela de criação — e quem cria já sabe se é plano. E
-- deixei o desconto só na tabela de degraus, sem tela: configuração que
-- ninguém consegue mexer é constante com passo extra.
--
-- ------------------------------------------------------- o tipo nasce no deal
-- A tela de criação cria um DEAL; o budget nasce depois, quando o editor
-- abre. Então a escolha mora no deal e o budget HERDA na criação. Sem isso a
-- pessoa escolheria "plano" e, um clique depois, o orçamento nasceria avulso.
--
-- --------------------------------------------------------- desconto em 2 níveis
--   plano_descontos          o PADRÃO da casa, por prazo (editável na tela)
--   budgets.desconto_plano   o desta negociação (NULL = usa o padrão)
--
-- Dois níveis porque as duas coisas são verdade: existe uma política (12
-- meses = 10%) e existe a negociação específica, onde o cliente arrancou 12%.
-- Um número só forçaria escolher entre ter política ou ter flexibilidade.
-- =========================================================================

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS recorrente     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contrato_meses int;

COMMENT ON COLUMN public.deals.recorrente IS
  'Escolhido na criação do orçamento. O budget herda quando nasce.';

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS desconto_plano numeric
    CHECK (desconto_plano IS NULL OR (desconto_plano >= 0 AND desconto_plano <= 90));

COMMENT ON COLUMN public.budgets.desconto_plano IS
  'Desconto DESTA negociação, em %. NULL = usa o padrão da casa '
  '(plano_descontos, pelo prazo). Preenchido = manda.';

/** O desconto que vale pra este orçamento: o dele, ou o padrão do prazo. */
CREATE OR REPLACE FUNCTION public.desconto_do_orcamento(_budget_id uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(b.desconto_plano, public.desconto_contrato(b.contrato_meses))
    FROM public.budgets b WHERE b.id = _budget_id
$$;

GRANT EXECUTE ON FUNCTION public.desconto_do_orcamento(uuid) TO authenticated;

-- O gerador do plano passa a respeitar o desconto da negociação.
CREATE OR REPLACE FUNCTION public.plano_do_orcamento(_budget_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  b record; _plano uuid; _meses int; _desc numeric; _mensal numeric;
BEGIN
  SELECT * INTO b FROM public.budgets WHERE id = _budget_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'orçamento não encontrado'; END IF;
  IF NOT COALESCE(b.recorrente, false) THEN
    RAISE EXCEPTION 'este orçamento é avulso — marque como plano antes de salvar';
  END IF;

  _meses  := COALESCE(b.contrato_meses, 12);
  -- O desconto desta negociação vence o padrão da casa.
  _desc   := COALESCE(b.desconto_plano, public.desconto_contrato(_meses));
  _mensal := round(COALESCE(b.total_value, 0) * (1 - _desc / 100.0), 2);

  SELECT id INTO _plano FROM public.planos WHERE budget_id = _budget_id;

  IF _plano IS NULL THEN
    INSERT INTO public.planos (nome, descricao, duracao_meses, valor_mensal, valor_total, budget_id)
    VALUES (
      COALESCE(NULLIF(btrim(b.proposal_name), ''), NULLIF(btrim(b.project_name), ''), 'Plano'),
      b.not_included, _meses, _mensal, round(_mensal * _meses, 2), _budget_id
    )
    RETURNING id INTO _plano;
  ELSE
    UPDATE public.planos
       SET duracao_meses = _meses, valor_mensal = _mensal,
           valor_total = round(_mensal * _meses, 2), updated_at = now()
     WHERE id = _plano;
    DELETE FROM public.plano_itens WHERE plano_id = _plano;
  END IF;

  INSERT INTO public.plano_itens (plano_id, descricao, quantidade, horas_unidade, custo_direto, diarias, ordem)
  SELECT
    _plano,
    COALESCE(NULLIF(btrim(bi.item_name), ''), 'Item'),
    GREATEST(COALESCE(bi.quantity, 1), 0),
    0,
    GREATEST(COALESCE(bi.supplier_cost, 0), 0),
    GREATEST(COALESCE(bi.diaria, 0), 0),
    COALESCE(bi.ordem, bi.order_index, 0)
  FROM public.budget_items bi
  WHERE bi.budget_id = _budget_id
    AND (COALESCE(bi.is_deliverable, false) OR COALESCE(bi.diaria, 0) > 0);

  RETURN _plano;
END $$;

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int;
BEGIN
  BEGIN
    DECLARE _cli uuid; _b uuid; _p uuid; _v record;
    BEGIN
      SELECT id INTO _cli FROM public.clients LIMIT 1;

      INSERT INTO public.budgets (project_name, client_name, client_id, total_value,
                                  recorrente, contrato_meses, status, budget_number)
      VALUES ('__teste__ Desc', '__teste__', _cli, 10000, true, 12, 'rascunho', 999998)
      RETURNING id INTO _b;
      INSERT INTO public.budget_items (budget_id, item_name, quantity, is_deliverable, supplier_cost, ordem)
      VALUES (_b, 'Vídeo', 4, true, 0, 1);

      -- 1. Sem override: vale o padrão da casa (12 meses = 10%).
      IF public.desconto_do_orcamento(_b) <> 10 THEN
        RAISE EXCEPTION 'RESULTADO:padrão do prazo deu %', public.desconto_do_orcamento(_b);
      END IF;
      _p := public.plano_do_orcamento(_b);
      SELECT * INTO _v FROM public.planos_v WHERE id = _p;
      IF _v.valor_mensal <> 9000 THEN RAISE EXCEPTION 'RESULTADO:mensal padrão deu %', _v.valor_mensal; END IF;

      -- 2. Com override, a negociação manda.
      UPDATE public.budgets SET desconto_plano = 12 WHERE id = _b;
      IF public.desconto_do_orcamento(_b) <> 12 THEN
        RAISE EXCEPTION 'RESULTADO:override não valeu (deu %)', public.desconto_do_orcamento(_b);
      END IF;
      PERFORM public.plano_do_orcamento(_b);
      SELECT * INTO _v FROM public.planos_v WHERE id = _p;
      IF _v.valor_mensal <> 8800 THEN
        RAISE EXCEPTION 'RESULTADO:mensal com override deu % (esperado 8800)', _v.valor_mensal;
      END IF;

      -- 3. Zerar o override é diferente de apagar: 0% é uma decisão.
      UPDATE public.budgets SET desconto_plano = 0 WHERE id = _b;
      IF public.desconto_do_orcamento(_b) <> 0 THEN
        RAISE EXCEPTION 'RESULTADO:desconto zero virou padrão (deu %)', public.desconto_do_orcamento(_b);
      END IF;

      -- 4. Voltar pro padrão é apagar (NULL).
      UPDATE public.budgets SET desconto_plano = NULL WHERE id = _b;
      IF public.desconto_do_orcamento(_b) <> 10 THEN
        RAISE EXCEPTION 'RESULTADO:não voltou pro padrão (deu %)', public.desconto_do_orcamento(_b);
      END IF;

      _res := 'ok';
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res <> 'ok' THEN RAISE EXCEPTION 'desconto: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.budgets WHERE project_name LIKE '\_\_teste\_\_%';
  IF _sobrou > 0 THEN RAISE EXCEPTION 'orçamento de teste persistiu (%)', _sobrou; END IF;

  RAISE NOTICE 'tipo no deal + desconto em dois níveis (padrão da casa × desta negociação)';
END $medicao$;
