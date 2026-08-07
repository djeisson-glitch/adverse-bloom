-- =========================================================================
-- Sul Minas, julho: o job 0203 entra no mês pelo valor do orçamento
--
-- Pedido do Djêisson (07/08/2026): "o cliente pediu pra gente inverter:
-- inserir esse 1650 na mesma nota do mês e separar em outra nota uma outra
-- entrega... só que os valores não estão fechando."
--
-- A metade "separar outra entrega" ele já tinha feito: o job 0020 está em
-- nota separada. Faltava a outra metade, e ela não fechava porque o botão
-- "usar o orçamento" nunca apareceu — eu o havia pendurado num campo que
-- ninguém preenche (`projects_financeiro.sold_value`), em vez do orçamento.
-- Corrigido em 20260807230000; o valor agora vem de `budgets.total_value`.
--
-- Esta migration aplica o que ele pediu, no dado:
--
--   projeto 0203  →  R$ 1.650,00, origem 'orcamento' (orçamento #0313)
--
-- Sem ela, o job entraria no mês pelas HORAS — 6,91h × R$ 160 = R$ 1.105,60
-- — e a nota do cliente sairia R$ 853,62 menor do que o combinado, já com a
-- margem e o imposto.
--
-- REVERSÍVEL em um clique: "voltar ao cálculo" na linha do job, em
-- Faturamento. É por isso que dá pra aplicar aqui com segurança — não é uma
-- porta de mão única.
--
-- Não mexo em mais nada: o 0020 fica onde ele o colocou, e nenhum outro job
-- ganha valor combinado.
-- =========================================================================

DO $$
DECLARE alvo uuid; orc numeric; antes numeric;
BEGIN
  SELECT p.id, b.total_value INTO alvo, orc
    FROM public.projects p
    LEFT JOIN public.budgets b ON b.id = p.budget_id
   WHERE p.numero = '0203';

  IF alvo IS NULL THEN RAISE EXCEPTION 'projeto 0203 não existe'; END IF;

  -- O valor sai do ORÇAMENTO, não de um literal digitado aqui: se o
  -- orçamento for outro, é o outro que vale, e a migration para se não
  -- houver nenhum. Número solto em migration é como se aplica o valor errado
  -- com toda a confiança do mundo.
  IF COALESCE(orc, 0) <= 0 THEN
    RAISE EXCEPTION 'o projeto 0203 não tem orçamento com valor — nada a aplicar';
  END IF;
  IF orc <> 1650 THEN
    RAISE EXCEPTION 'o orçamento do 0203 vale % e o combinado com o cliente foi 1650 — confira antes', orc;
  END IF;

  SELECT valor_fechamento INTO antes FROM public.projects WHERE id = alvo;
  UPDATE public.projects
     SET valor_fechamento = orc, valor_fechamento_origem = 'orcamento'
   WHERE id = alvo;

  RAISE NOTICE '0203: valor de fechamento % → % (orçamento)', COALESCE(antes::text, 'calculado'), orc;
END $$;

-- Refaz o rascunho de julho com o valor aplicado.
SELECT public.gerar_faturamento_mensal(date '2026-07-01');

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE
  cli uuid; sub numeric; tot numeric; ns numeric; nt numeric;
  horas_0203 numeric; ovr numeric;
BEGIN
  SELECT cf.client_id INTO cli FROM public.client_faturamento cf
   JOIN public.clients c ON c.id = cf.client_id WHERE c.name ILIKE '%Sul Minas%' LIMIT 1;

  SELECT fm.subtotal, fm.total,
         (fm.detalhe->'nota_mes'->>'subtotal')::numeric, (fm.detalhe->'nota_mes'->>'total')::numeric
    INTO sub, tot, ns, nt
    FROM public.faturamento_mensal fm WHERE fm.client_id = cli AND fm.ref_mes = date '2026-07-01';

  SELECT (x->>'horas')::numeric, (x->>'valor_fechamento')::numeric INTO horas_0203, ovr
    FROM public.faturamento_mensal fm, LATERAL jsonb_array_elements(fm.detalhe->'por_projeto') x
   WHERE fm.client_id = cli AND fm.ref_mes = date '2026-07-01' AND x->>'numero' = '0203';

  IF COALESCE(ovr, 0) <> 1650 THEN
    RAISE EXCEPTION 'o painel não está mostrando os R$ 1.650 no 0203 (mostra %)', ovr;
  END IF;

  -- O job tem que estar no MÊS (era o pedido do cliente), não na nota
  -- separada — e a nota separada continua sendo a do 0020.
  IF NOT EXISTS (
    SELECT 1 FROM public.faturamento_mensal fm, LATERAL jsonb_array_elements(fm.detalhe->'por_projeto') x
     WHERE fm.client_id = cli AND fm.ref_mes = date '2026-07-01'
       AND x->>'numero' = '0203' AND x->>'balde' = 'mensal'
  ) THEN
    RAISE EXCEPTION 'o 0203 não está no balde do mês';
  END IF;

  RAISE NOTICE 'julho/Sul Minas: mês subtotal % total % · nota separada subtotal % total % (0203 = R$ 1.650 pelo orçamento, %h apontadas)',
    sub, tot, ns, nt, horas_0203;
END $medicao$;
