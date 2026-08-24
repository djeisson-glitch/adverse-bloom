-- =========================================================================
-- Criar outra opção do orçamento voltou a funcionar
--
-- Djêisson (20/08/2026): "a opção de criar outra opção no orçamento nao está
-- funcionando... pode verificar por favor?"
--
-- MEDIDO: rodando `orcamento_criar_variante` num orçamento real, o banco
-- responde
--
--   23505 duplicate key value violates unique constraint
--         "idx_budget_number_version"
--
-- O índice era UNIQUE (budget_number, version). A variante nasce como cópia —
-- mesmo número, mesma versão — e batia de frente com ele. Nenhuma opção nova
-- conseguia nascer desde que esse índice existe.
--
-- A CORREÇÃO é conceitual, não um remendo: VARIANTE NÃO É VERSÃO.
--
--   versão   é histórico — v1, v2, v3 da mesma proposta, só a última vale
--   variante são duas opções VIVAS ao mesmo tempo ("com drone" × "sem
--            drone"), e o cliente escolhe uma
--
-- Então a unicidade passa a ser (número, versão, nome da variante). A
-- garantia antiga continua de pé — não existem dois orçamentos principais com
-- o mesmo número e versão — e as opções paralelas passam a caber.
--
-- `coalesce(variante_nome,'')` e não a coluna crua: em índice único, NULL não
-- conflita com NULL, então duas linhas principais (ambas NULL) escapariam da
-- checagem — exatamente o que o índice existe pra impedir.
--
-- O front também mentia sobre o erro: ele testava a mensagem com
-- /duplicate key/ e dizia "Já existe uma opção com esse nome". O nome não
-- tinha nada a ver, e a pessoa ficava trocando o nome pra sempre. Corrigido
-- no mesmo PR.
-- =========================================================================

DROP INDEX IF EXISTS public.idx_budget_number_version;

CREATE UNIQUE INDEX idx_budget_number_version
  ON public.budgets (budget_number, version, coalesce(variante_nome, ''));

COMMENT ON INDEX public.idx_budget_number_version IS
  'Número + versão + variante. Variante NÃO é versão: duas opções vivas do '
  'mesmo filme dividem número e versão e se distinguem pelo nome.';

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int;
BEGIN
  BEGIN
    DECLARE _b uuid; _deal uuid; _v1 uuid; _v2 uuid; _n int; _itens_base int;
    BEGIN
      SELECT id, deal_id INTO _b, _deal FROM public.budgets
       WHERE deal_id IS NOT NULL AND coalesce(variante_nome,'') = ''
       ORDER BY created_at DESC LIMIT 1;
      IF _b IS NULL THEN RAISE EXCEPTION 'RESULTADO:sem orçamento base pra exercitar'; END IF;

      SELECT count(*) INTO _itens_base FROM public.budget_items WHERE budget_id = _b;

      -- 1. A opção nasce — era exatamente isto que estourava.
      _v1 := public.orcamento_criar_variante(_b, '__teste__ Com drone');
      IF _v1 IS NULL THEN RAISE EXCEPTION 'RESULTADO:não retornou id'; END IF;

      -- 2. E nasce COM os itens copiados: opção vazia não serve pra comparar.
      SELECT count(*) INTO _n FROM public.budget_items WHERE budget_id = _v1;
      IF _n <> _itens_base THEN
        RAISE EXCEPTION 'RESULTADO:copiou % itens de % da base', _n, _itens_base;
      END IF;

      -- 3. Uma SEGUNDA opção também cabe (o índice não trava a terceira linha).
      _v2 := public.orcamento_criar_variante(_b, '__teste__ Sem drone');
      IF _v2 IS NULL OR _v2 = _v1 THEN RAISE EXCEPTION 'RESULTADO:segunda opção não nasceu'; END IF;

      -- 4. Mas nome REPETIDO continua barrado — é assim que o cliente
      --    distingue as opções, e o front conta com esse erro.
      BEGIN
        PERFORM public.orcamento_criar_variante(_b, '__teste__ Com drone');
        RAISE EXCEPTION 'RESULTADO:aceitou duas opções com o mesmo nome';
      EXCEPTION WHEN unique_violation THEN
        NULL;  -- esperado
      WHEN raise_exception THEN
        IF SQLERRM LIKE 'RESULTADO:%' THEN RAISE; END IF;
      END;

      -- 5. As três aparecem juntas na lista do seletor.
      SELECT count(*) INTO _n FROM public.orcamento_variantes(_deal);
      IF _n < 3 THEN RAISE EXCEPTION 'RESULTADO:o seletor lista só % opção(ões)', _n; END IF;

      _res := format('ok · %s itens copiados', _itens_base);
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res NOT LIKE 'ok%' THEN RAISE EXCEPTION 'variante: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.budgets WHERE variante_nome LIKE '\_\_teste\_\_%';
  IF _sobrou > 0 THEN RAISE EXCEPTION 'variante de teste persistiu (%)', _sobrou; END IF;

  RAISE NOTICE 'criar outra opção funciona; nome repetido segue barrado — %', _res;
END $medicao$;
