-- =========================================================================
-- Unidade do item: por MÊS ou no CONTRATO
--
-- Djêisson (19/08/2026): "na tabela de comparação acho que vale colocar tipo
-- unidade sabe? tipo, video institucional 1 min - 2 (mas é por mês ou por
-- contrato?) pra gente identificar e deixar claro na hora de montar a
-- proposta."
--
-- O "2" era ambíguo na tela E no modelo. Até aqui TUDO era mensal por
-- convenção — convenção que só existia num comentário meu. Mas plano anual de
-- verdade tem as duas coisas: "12 reels por mês" e "1 filme manifesto no ano".
--
-- ------------------------------------------------------------- o que muda
-- Não é só rótulo. Um item "no contrato" com 20h NÃO custa 20h por mês; custa
-- 20h uma vez. Contá-lo como mensal multiplicaria o custo por 12 e mataria a
-- margem de qualquer plano com uma peça anual — ou, ao contrário, faria a
-- proposta prometer 12 filmes manifesto.
--
-- Então o custo do item de contrato é DILUÍDO: 20h ÷ 12 meses entram na
-- margem mensal, e o total do contrato fecha igual. É a única forma de as
-- duas visões (mês e contrato) baterem com o mesmo escopo.
--
-- Padrão 'mes' porque é o que os itens de hoje são — nenhum plano existente
-- muda de valor por causa desta migration, e a medição prova isso.
-- =========================================================================

ALTER TABLE public.plano_itens
  ADD COLUMN IF NOT EXISTS unidade text NOT NULL DEFAULT 'mes'
    CHECK (unidade IN ('mes', 'contrato'));

COMMENT ON COLUMN public.plano_itens.unidade IS
  'mes = a quantidade se repete todo mês. contrato = acontece uma vez na '
  'vigência (o custo é diluído pelos meses pra margem mensal fechar).';

DROP VIEW IF EXISTS public.planos_v;
CREATE VIEW public.planos_v
WITH (security_invoker = on) AS
SELECT
  p.*,
  COALESCE(i.itens, 0)            AS itens,
  COALESCE(i.entregas_mes, 0)     AS entregas_mes,
  COALESCE(i.entregas_contrato, 0) AS entregas_contrato,
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
    count(*) FILTER (WHERE pi.incluso)                                     AS itens,
    count(*) FILTER (WHERE NOT pi.incluso)                                 AS fora,
    sum(pi.quantidade) FILTER (WHERE pi.incluso AND pi.unidade = 'mes')      AS entregas_mes,
    sum(pi.quantidade) FILTER (WHERE pi.incluso AND pi.unidade = 'contrato') AS entregas_contrato,
    sum(pi.quantidade * pi.diarias) FILTER (WHERE pi.incluso AND pi.unidade = 'mes') AS diarias_mes,
    -- Horas e custo do item de CONTRATO entram diluídos pelos meses: 20h numa
    -- peça anual são 20/12 por mês, não 20 por mês.
    sum(
      pi.quantidade * pi.horas_unidade
      / CASE WHEN pi.unidade = 'contrato' THEN GREATEST(p.duracao_meses, 1) ELSE 1 END
    ) FILTER (WHERE pi.incluso) AS horas_mes,
    sum(
      pi.quantidade * (pi.horas_unidade * COALESCE(rc.custo_hora, 0) + pi.custo_direto)
      / CASE WHEN pi.unidade = 'contrato' THEN GREATEST(p.duracao_meses, 1) ELSE 1 END
    ) FILTER (WHERE pi.incluso) AS custo_mensal,
    sum(pi.quantidade * pi.horas_unidade)
      FILTER (WHERE pi.incluso AND rc.id IS NULL AND pi.horas_unidade > 0)  AS horas_sem_funcao
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
    DECLARE _p uuid; _rc uuid; _custo numeric; _v record; _antes numeric;
    BEGIN
      SELECT id, custo_hora INTO _rc, _custo FROM public.rate_card
       WHERE ativo AND COALESCE(custo_hora,0) > 0 ORDER BY ordem LIMIT 1;

      INSERT INTO public.planos (nome, duracao_meses, valor_mensal)
      VALUES ('__teste__ Unidade', 12, 10000) RETURNING id INTO _p;

      -- Mensal: 4 vídeos × 5h todo mês = 20h/mês.
      INSERT INTO public.plano_itens (plano_id, descricao, quantidade, horas_unidade, rate_card_id, unidade, ordem)
      VALUES (_p, 'Vídeo 1min', 4, 5, _rc, 'mes', 1);

      SELECT * INTO _v FROM public.planos_v WHERE id = _p;
      IF _v.horas_mes <> 20 THEN RAISE EXCEPTION 'RESULTADO:mensal deu %h', _v.horas_mes; END IF;
      _antes := _v.custo_mensal;

      -- Contrato: 1 filme × 24h UMA vez em 12 meses = 2h/mês diluídas.
      INSERT INTO public.plano_itens (plano_id, descricao, quantidade, horas_unidade, rate_card_id, unidade, ordem)
      VALUES (_p, 'Filme manifesto', 1, 24, _rc, 'contrato', 2);

      SELECT * INTO _v FROM public.planos_v WHERE id = _p;
      IF _v.horas_mes <> 22 THEN
        RAISE EXCEPTION 'RESULTADO:com o item de contrato deu %h (esperado 22 = 20 + 24/12)', _v.horas_mes;
      END IF;
      IF _v.custo_mensal <> _antes + (24 * _custo / 12) THEN
        RAISE EXCEPTION 'RESULTADO:custo mensal não diluiu (% vs %)', _v.custo_mensal, _antes + (24 * _custo / 12);
      END IF;

      -- As duas visões batem: no contrato inteiro são 24h de verdade.
      IF round(_v.custo_contrato, 2) <> round((_antes + 24 * _custo / 12) * 12, 2) THEN
        RAISE EXCEPTION 'RESULTADO:contrato não fecha (%)', _v.custo_contrato;
      END IF;

      -- E a contagem de ENTREGAS separa as duas unidades, que é o que a
      -- proposta precisa dizer.
      IF _v.entregas_mes <> 4 THEN RAISE EXCEPTION 'RESULTADO:entregas/mês deu %', _v.entregas_mes; END IF;
      IF _v.entregas_contrato <> 1 THEN RAISE EXCEPTION 'RESULTADO:entregas do contrato deu %', _v.entregas_contrato; END IF;

      _res := 'ok';
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res <> 'ok' THEN RAISE EXCEPTION 'unidade: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.planos WHERE nome LIKE '\_\_teste\_\_%';
  IF _sobrou > 0 THEN RAISE EXCEPTION 'plano de teste persistiu (%)', _sobrou; END IF;

  RAISE NOTICE 'unidade por item: mensal soma direto, contrato dilui pelos meses e as duas visões fecham';
END $medicao$;
