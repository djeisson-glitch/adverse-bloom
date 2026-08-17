-- =========================================================================
-- O plano nasce no ORÇAMENTO, não numa tela à parte
--
-- Djêisson (13/08/2026): "nao nao, nao é isso. eu quero que no modulo de
-- orçamentos, eu selecione se estou fazendo avulso ou plano. se for plano, ai
-- sim ele habilita a opção de colocarmos o prazo de contrato, precisamos tb
-- pensar em desconto progressivo, quanto mais longo for o contrato, e também
-- as linhas da planilha e isso ficar salvo como um plano."
--
-- Correção de rumo minha: montei o catálogo como ilha, com escopo digitado do
-- zero. Mas o escopo JÁ é digitado uma vez — na planilha do orçamento. Fazer
-- de novo em outra tela é pedir pra os dois divergirem, e aí ninguém sabe
-- qual é o combinado de verdade.
--
--   orçamento avulso   → como hoje
--   orçamento plano    → prazo de contrato + desconto progressivo, e a
--                        planilha vira o escopo mensal do plano
--
-- ------------------------------------------------------- desconto progressivo
-- Degraus numa TABELA, não numa constante: quem decide desconto é comercial,
-- e comercial muda de ideia sem deploy. Começa em 3m=0 · 6m=5% · 12m=10%,
-- que é o que se pratica — e é editável.
--
-- O desconto incide sobre o valor MENSAL. Contrato longo dá previsibilidade
-- de caixa; o preço da previsibilidade é a mensalidade menor, não uma
-- "bonificação" no fim que ninguém sabe onde entra.
--
-- ------------------------------------------------------------ custo do item
-- `plano_itens` ganha `custo_direto`. A planilha do orçamento já sabe o custo
-- de fornecedor de cada linha (`supplier_cost`) — isso é custo que não passa
-- por hora nossa (locação, freela, deslocamento). O custo de HORA continua
-- vindo do rate card. Um item pode ter os dois, e o total é a soma: sem essa
-- coluna eu teria que fingir que todo custo é hora, e a margem sairia errada
-- pra qualquer plano com diária.
-- =========================================================================

-- ------------------------------------------------- o orçamento sabe o que é
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS recorrente     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contrato_meses int;

COMMENT ON COLUMN public.budgets.recorrente IS
  'false = avulso (como sempre foi). true = plano: a planilha é o escopo MENSAL '
  'e o total do contrato é mensal × meses, com desconto progressivo.';

-- ------------------------------------------------------ desconto por prazo
CREATE TABLE IF NOT EXISTS public.plano_descontos (
  meses    int PRIMARY KEY CHECK (meses BETWEEN 1 AND 60),
  percent  numeric NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 90),
  ativo    boolean NOT NULL DEFAULT true
);

INSERT INTO public.plano_descontos (meses, percent) VALUES
  (3, 0), (6, 5), (12, 10)
ON CONFLICT (meses) DO NOTHING;

/**
 * Desconto do prazo. Prazo sem degrau cadastrado usa o MAIOR degrau que cabe
 * — 9 meses pega o de 6, não zero. Assim ninguém perde desconto por não ter
 * cadastrado um degrau exato.
 */
CREATE OR REPLACE FUNCTION public.desconto_contrato(_meses int)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT percent FROM public.plano_descontos
      WHERE ativo AND meses <= COALESCE(_meses, 0)
      ORDER BY meses DESC LIMIT 1), 0)
$$;

ALTER TABLE public.plano_descontos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "descontos leitura" ON public.plano_descontos;
CREATE POLICY "descontos leitura" ON public.plano_descontos FOR SELECT TO authenticated
  USING (public.pode_ver_dinheiro());
DROP POLICY IF EXISTS "descontos admin" ON public.plano_descontos;
CREATE POLICY "descontos admin" ON public.plano_descontos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------- custo que não é hora nossa
ALTER TABLE public.plano_itens
  ADD COLUMN IF NOT EXISTS custo_direto numeric NOT NULL DEFAULT 0 CHECK (custo_direto >= 0),
  -- NUMÉRICA, não sim/não: `budget_items.diaria` guarda QUANTAS diárias a
  -- linha consome, e uma entrega pode consumir 2. Eu tinha assumido boolean e
  -- o banco me corrigiu — bom lugar pra ser corrigido.
  ADD COLUMN IF NOT EXISTS diarias numeric NOT NULL DEFAULT 0 CHECK (diarias >= 0);

COMMENT ON COLUMN public.plano_itens.custo_direto IS
  'Custo por unidade que NÃO passa por hora nossa (freela, locação, '
  'deslocamento). Vem de budget_items.supplier_cost. Soma com horas × rate.';

-- `budget_id` entra ANTES da view: `p.*` congela a lista de colunas no
-- momento do CREATE, e a view nasceria sem ela. Mesma armadilha que já custou
-- caro em projects_v.
ALTER TABLE public.planos ADD COLUMN IF NOT EXISTS budget_id uuid REFERENCES public.budgets(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_planos_budget ON public.planos (budget_id) WHERE budget_id IS NOT NULL;

-- DROP e não CREATE OR REPLACE: a view ganha `diarias_mes` NO MEIO, e
-- replace só aceita colunas novas no fim.
DROP VIEW IF EXISTS public.planos_v;
CREATE VIEW public.planos_v
WITH (security_invoker = on) AS
SELECT
  p.*,
  COALESCE(i.itens, 0)            AS itens,
  COALESCE(i.entregas_mes, 0)     AS entregas_mes,
  COALESCE(i.diarias_mes, 0)      AS diarias_mes,
  COALESCE(i.horas_mes, 0)        AS horas_mes,
  COALESCE(i.custo_mensal, 0)     AS custo_mensal,
  COALESCE(i.horas_sem_funcao, 0) AS horas_sem_funcao,
  p.valor_mensal - COALESCE(i.custo_mensal, 0) AS margem_mensal,
  CASE WHEN p.valor_mensal > 0
       THEN round(((p.valor_mensal - COALESCE(i.custo_mensal, 0)) / p.valor_mensal) * 100, 1)
       ELSE 0 END                 AS margem_percent,
  COALESCE(p.valor_total, p.valor_mensal * p.duracao_meses)        AS valor_contrato,
  COALESCE(i.custo_mensal, 0) * p.duracao_meses                    AS custo_contrato,
  COALESCE(p.valor_total, p.valor_mensal * p.duracao_meses)
    - COALESCE(i.custo_mensal, 0) * p.duracao_meses                AS margem_contrato
FROM public.planos p
LEFT JOIN LATERAL (
  SELECT
    count(*)                                                             AS itens,
    sum(pi.quantidade)                                                   AS entregas_mes,
    sum(pi.quantidade * pi.diarias)                                      AS diarias_mes,
    sum(pi.quantidade * pi.horas_unidade)                                AS horas_mes,
    -- hora nossa + custo que sai da porta
    sum(pi.quantidade * (pi.horas_unidade * COALESCE(rc.custo_hora, 0) + pi.custo_direto)) AS custo_mensal,
    sum(pi.quantidade * pi.horas_unidade) FILTER (WHERE rc.id IS NULL AND pi.horas_unidade > 0) AS horas_sem_funcao
  FROM public.plano_itens pi
  LEFT JOIN public.rate_card rc ON rc.id = pi.rate_card_id
  WHERE pi.plano_id = p.id
) i ON true;

-- ----------------------------------------- o orçamento vira plano, num clique
/**
 * Cria (ou refaz) o plano a partir da planilha do orçamento.
 *
 * Copia as linhas de ENTREGA — que é o que o cliente compra. Cada linha leva
 * a quantidade e o custo de fornecedor; as HORAS ficam em branco pra alguém
 * preencher, e `planos_v.horas_sem_funcao` mais o aviso da tela cobram isso.
 * Chutar horas aqui seria inventar margem.
 *
 * Refazer é seguro: apaga os itens e regrava. O plano é espelho do orçamento
 * enquanto o orçamento for a fonte; quem quiser divergir, edita depois.
 */
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
  _desc   := public.desconto_contrato(_meses);
  -- O total da planilha é a MENSALIDADE cheia; o prazo desconta dela.
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
    0,                                       -- horas: quem sabe é a produção
    GREATEST(COALESCE(bi.supplier_cost, 0), 0),
    GREATEST(COALESCE(bi.diaria, 0), 0),
    COALESCE(bi.ordem, bi.order_index, 0)
  FROM public.budget_items bi
  WHERE bi.budget_id = _budget_id
    AND (COALESCE(bi.is_deliverable, false) OR COALESCE(bi.diaria, 0) > 0);

  RETURN _plano;
END $$;

GRANT SELECT ON public.planos_v TO authenticated;
GRANT EXECUTE ON FUNCTION public.desconto_contrato(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plano_do_orcamento(uuid) TO authenticated;

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int;
BEGIN
  -- Degraus e o "maior que cabe".
  IF public.desconto_contrato(3)  <> 0  THEN RAISE EXCEPTION '3 meses deveria ser 0%%'; END IF;
  IF public.desconto_contrato(6)  <> 5  THEN RAISE EXCEPTION '6 meses deveria ser 5%%'; END IF;
  IF public.desconto_contrato(12) <> 10 THEN RAISE EXCEPTION '12 meses deveria ser 10%%'; END IF;
  IF public.desconto_contrato(9)  <> 5  THEN RAISE EXCEPTION '9 meses deveria pegar o degrau de 6 (deu %)', public.desconto_contrato(9); END IF;
  IF public.desconto_contrato(1)  <> 0  THEN RAISE EXCEPTION '1 mês deveria ser 0%%'; END IF;

  BEGIN
    DECLARE
      _cli uuid; _b uuid; _p uuid; _v record; _rc uuid; _custo numeric;
    BEGIN
      SELECT id INTO _cli FROM public.clients LIMIT 1;
      SELECT id, custo_hora INTO _rc, _custo FROM public.rate_card
       WHERE ativo AND COALESCE(custo_hora,0) > 0 ORDER BY ordem LIMIT 1;

      -- `budget_number` fixo: a sequência não volta com o rollback, e o
      -- primeiro teste já queimou um número. Mesma regra dos códigos.
      INSERT INTO public.budgets (project_name, client_name, client_id, total_value,
                                  recorrente, contrato_meses, status, budget_number)
      VALUES ('__teste__ Plano', '__teste__', _cli, 10000, true, 12, 'rascunho', 999999)
      RETURNING id INTO _b;

      -- 4 vídeos (entrega, sem custo de fornecedor) + 2 diárias a R$ 500
      INSERT INTO public.budget_items (budget_id, item_name, quantity, is_deliverable, supplier_cost, ordem)
      VALUES (_b, 'Vídeo 1min', 4, true, 0, 1);
      -- 1 linha de captação que consome 2 diárias, a R$ 500 cada
      INSERT INTO public.budget_items (budget_id, item_name, quantity, diaria, supplier_cost, ordem)
      VALUES (_b, 'Captação', 1, 2, 1000, 2);

      _p := public.plano_do_orcamento(_b);
      SELECT * INTO _v FROM public.planos_v WHERE id = _p;

      -- 12 meses = 10% off sobre 10.000 → 9.000/mês, 108.000 no contrato.
      IF _v.valor_mensal <> 9000 THEN
        RAISE EXCEPTION 'RESULTADO:mensal com desconto deu % (esperado 9000)', _v.valor_mensal;
      END IF;
      IF _v.valor_contrato <> 108000 THEN
        RAISE EXCEPTION 'RESULTADO:contrato deu % (esperado 108000)', _v.valor_contrato;
      END IF;

      -- Entregas e diárias contadas SEPARADAS (é como o cliente lê a proposta).
      IF _v.entregas_mes <> 5 THEN RAISE EXCEPTION 'RESULTADO:entregas/mês deu % (4 vídeos + 1 captação)', _v.entregas_mes; END IF;
      IF _v.diarias_mes  <> 2 THEN RAISE EXCEPTION 'RESULTADO:diárias/mês deu %', _v.diarias_mes; END IF;

      -- Custo direto veio da planilha: 2 diárias × 500 = 1.000, sem hora nenhuma.
      IF _v.custo_mensal <> 1000 THEN
        RAISE EXCEPTION 'RESULTADO:custo mensal deu % (esperado 1000 das diárias)', _v.custo_mensal;
      END IF;
      -- E ainda não há hora lançada, então nada em "horas sem função".
      IF _v.horas_sem_funcao <> 0 THEN
        RAISE EXCEPTION 'RESULTADO:horas sem função deu % com zero horas', _v.horas_sem_funcao;
      END IF;

      -- Agora a produção informa as horas: 4 vídeos × 5h na função escolhida.
      UPDATE public.plano_itens SET horas_unidade = 5, rate_card_id = _rc
       WHERE plano_id = _p AND diarias = 0;
      SELECT * INTO _v FROM public.planos_v WHERE id = _p;
      IF _v.custo_mensal <> 1000 + 20 * _custo THEN
        RAISE EXCEPTION 'RESULTADO:custo com horas deu % (esperado %)', _v.custo_mensal, 1000 + 20 * _custo;
      END IF;

      -- Refazer a partir do orçamento é idempotente (não duplica linha).
      PERFORM public.plano_do_orcamento(_b);
      SELECT * INTO _v FROM public.planos_v WHERE id = _p;
      IF _v.itens <> 2 THEN
        RAISE EXCEPTION 'RESULTADO:refazer duplicou itens (ficou %)', _v.itens;
      END IF;

      -- Avulso não vira plano.
      UPDATE public.budgets SET recorrente = false WHERE id = _b;
      BEGIN
        PERFORM public.plano_do_orcamento(_b);
        RAISE EXCEPTION 'RESULTADO:orçamento avulso virou plano';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'RESULTADO:%' THEN RAISE; END IF;
      END;

      _res := 'ok';
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res <> 'ok' THEN RAISE EXCEPTION 'orçamento→plano: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.budgets WHERE project_name LIKE '\_\_teste\_\_%';
  IF _sobrou > 0 THEN RAISE EXCEPTION 'orçamento de teste persistiu (%)', _sobrou; END IF;

  RAISE NOTICE 'orçamento vira plano: desconto por prazo, entregas e diárias separadas, custo direto da planilha';
END $medicao$;
