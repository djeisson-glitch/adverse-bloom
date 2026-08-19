-- =========================================================================
-- O que o plano INCLUI e o que NÃO inclui — pra comparar lado a lado
--
-- Djêisson (19/08/2026): "quero uma tela exclusiva pra montar planos, que
-- inclusive tenha a opção de comparar todos com o que inclui e não inclui.
-- vai ficar melhor do que dentro do modulo de orçamento, pq vou ter que
-- atrelar a um cliente e também vai ficar tudo misturado."
--
-- Ele está certo no diagnóstico: montar plano dentro do orçamento obriga a
-- escolher um CLIENTE antes de ter o plano — e plano é catálogo, existe antes
-- de qualquer cliente. O caminho orçamento→plano continua (serve pra
-- transformar uma proposta que já existe), mas deixa de ser o único.
--
-- ---------------------------------------------------------- o "não inclui"
-- Uma linha do escopo passa a poder ser NEGATIVA: `incluso = false`.
--
-- Modelei como flag na mesma tabela, e não como um campo de texto "não
-- inclui" no plano, porque a comparação lado a lado só funciona se as duas
-- faces forem a MESMA coisa medida: "Motion graphics" precisa ser a mesma
-- linha no Essencial (não inclui) e no Premium (2/mês) pra virar uma linha da
-- tabela comparativa. Texto solto não compara.
--
-- Item não incluso não soma quantidade, hora nem custo — ele existe só pra
-- dizer o que fica de fora, que é metade do que faz o cliente escolher o
-- plano de cima.
-- =========================================================================

ALTER TABLE public.plano_itens
  ADD COLUMN IF NOT EXISTS incluso boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.plano_itens.incluso IS
  'false = aparece na proposta como "não incluso". Não soma quantidade, hora '
  'nem custo — serve pra comparação entre planos.';

-- A view precisa ignorar o não-incluso em TODA soma, senão um item marcado
-- como fora inflaria horas e custo do plano.
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
  COALESCE(i.fora, 0)             AS itens_fora,
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
    count(*) FILTER (WHERE pi.incluso)                                        AS itens,
    count(*) FILTER (WHERE NOT pi.incluso)                                    AS fora,
    sum(pi.quantidade)              FILTER (WHERE pi.incluso)                 AS entregas_mes,
    sum(pi.quantidade * pi.diarias) FILTER (WHERE pi.incluso)                 AS diarias_mes,
    sum(pi.quantidade * pi.horas_unidade) FILTER (WHERE pi.incluso)           AS horas_mes,
    sum(pi.quantidade * (pi.horas_unidade * COALESCE(rc.custo_hora, 0) + pi.custo_direto))
      FILTER (WHERE pi.incluso)                                               AS custo_mensal,
    sum(pi.quantidade * pi.horas_unidade)
      FILTER (WHERE pi.incluso AND rc.id IS NULL AND pi.horas_unidade > 0)    AS horas_sem_funcao
  FROM public.plano_itens pi
  LEFT JOIN public.rate_card rc ON rc.id = pi.rate_card_id
  WHERE pi.plano_id = p.id
) i ON true;

GRANT SELECT ON public.planos_v TO authenticated;

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int;
BEGIN
  BEGIN
    DECLARE _p uuid; _rc uuid; _custo numeric; _v record;
    BEGIN
      SELECT id, custo_hora INTO _rc, _custo FROM public.rate_card
       WHERE ativo AND COALESCE(custo_hora,0) > 0 ORDER BY ordem LIMIT 1;

      INSERT INTO public.planos (nome, duracao_meses, valor_mensal)
      VALUES ('__teste__ Comparar', 12, 8000) RETURNING id INTO _p;

      -- Incluso: 4 vídeos × 5h. Fora: motion (2 × 3h) — não pode somar nada.
      INSERT INTO public.plano_itens (plano_id, descricao, quantidade, horas_unidade, rate_card_id, incluso, ordem)
      VALUES (_p, 'Vídeo 1min', 4, 5, _rc, true, 1),
             (_p, 'Motion graphics', 2, 3, _rc, false, 2);

      SELECT * INTO _v FROM public.planos_v WHERE id = _p;

      IF _v.itens <> 1 THEN RAISE EXCEPTION 'RESULTADO:itens inclusos deu %', _v.itens; END IF;
      IF _v.itens_fora <> 1 THEN RAISE EXCEPTION 'RESULTADO:itens fora deu %', _v.itens_fora; END IF;
      IF _v.entregas_mes <> 4 THEN RAISE EXCEPTION 'RESULTADO:o não-incluso entrou nas entregas (%)', _v.entregas_mes; END IF;
      IF _v.horas_mes <> 20 THEN RAISE EXCEPTION 'RESULTADO:o não-incluso entrou nas horas (%)', _v.horas_mes; END IF;
      IF _v.custo_mensal <> 20 * _custo THEN
        RAISE EXCEPTION 'RESULTADO:o não-incluso entrou no custo (% vs %)', _v.custo_mensal, 20 * _custo;
      END IF;

      -- Marcar como incluso passa a somar — a flag é o único eixo.
      UPDATE public.plano_itens SET incluso = true WHERE plano_id = _p AND NOT incluso;
      SELECT * INTO _v FROM public.planos_v WHERE id = _p;
      IF _v.horas_mes <> 26 THEN RAISE EXCEPTION 'RESULTADO:ao incluir, horas deu %', _v.horas_mes; END IF;
      IF _v.itens_fora <> 0 THEN RAISE EXCEPTION 'RESULTADO:ainda conta item fora (%)', _v.itens_fora; END IF;

      _res := 'ok';
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res <> 'ok' THEN RAISE EXCEPTION 'inclui/não inclui: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.planos WHERE nome LIKE '\_\_teste\_\_%';
  IF _sobrou > 0 THEN RAISE EXCEPTION 'plano de teste persistiu (%)', _sobrou; END IF;

  RAISE NOTICE 'item não-incluso aparece na comparação e não soma quantidade, hora nem custo';
END $medicao$;
