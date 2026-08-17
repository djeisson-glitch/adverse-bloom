-- =========================================================================
-- Planos recorrentes: o que o cliente compra × o que a gente gasta
--
-- Djêisson (13/08/2026): "tem também como a gente criar um modulo pra criar
-- pacotes/planos recorrentes? que a gente consiga colocar tudo o que inclui, o
-- prazo do contrato (03 meses, 06 ou 12), valor total do contrato, valor
-- mensal, escopo mensal, rentabilidade mensal e total, e criar esses planos
-- pré-definidos?"
--
-- E, sobre como contar o escopo: "vamos ter tanto as entregas quanto horas.
-- pro cliente vamos vender entregas, mas interno vamos entender as horas
-- daquele material."
--
-- Essa frase é a arquitetura inteira. Cada item do escopo carrega as DUAS
-- faces do mesmo combinado:
--
--   quantidade + descrição   → o que vai na proposta ("4 vídeos de 1min")
--   horas × custo/hora       → o que decide se o plano se paga
--
-- O custo vem do `rate_card` por função, que já existe e já é mantido — não
-- inventei tabela de custo nova. Mudou o rate card, a margem do CATÁLOGO se
-- move junto, que é o certo pra um modelo de proposta.
--
-- --------------------------------------------------------------- o congelamento
-- `cliente_planos` copia valor e custo no momento em que o plano é aplicado.
-- Catálogo é modelo, contrato é promessa: se o rate card subir em outubro, a
-- margem prevista do contrato assinado em agosto NÃO pode mudar sozinha — ela
-- é o que foi vendido. Sem essa cópia, um reajuste de custo reescreveria a
-- história de todo contrato ativo.
--
-- -------------------------------------------------------------------- dinheiro
-- Tudo aqui é valor e margem, então a RLS é a mesma do resto do dinheiro:
-- `pode_ver_dinheiro()`. Editor não vê plano — como não vê custo/hora nem
-- valor de projeto.
-- =========================================================================

-- ------------------------------------------------------------- o catálogo
CREATE TABLE IF NOT EXISTS public.planos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text NOT NULL,
  descricao      text,
  duracao_meses  int  NOT NULL DEFAULT 12 CHECK (duracao_meses BETWEEN 1 AND 60),
  valor_mensal   numeric NOT NULL DEFAULT 0 CHECK (valor_mensal >= 0),
  -- Livre porque contrato longo costuma ter desconto: quando fica NULL, vale
  -- mensal × meses; quando é preenchido, ele manda (e a tela mostra a
  -- diferença, pra ninguém dar desconto sem perceber).
  valor_total    numeric CHECK (valor_total IS NULL OR valor_total >= 0),
  ativo          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.planos IS
  'Catálogo de pacotes recorrentes. Modelo pra montar proposta — o contrato de '
  'um cliente vive em cliente_planos, com valores congelados.';

-- ------------------------------------------------------- o escopo mensal
CREATE TABLE IF NOT EXISTS public.plano_itens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id      uuid NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  -- A face do cliente.
  descricao     text NOT NULL,
  quantidade    numeric NOT NULL DEFAULT 1 CHECK (quantidade >= 0),
  -- A face de dentro: horas de UMA unidade, e de quem é a hora.
  horas_unidade numeric NOT NULL DEFAULT 0 CHECK (horas_unidade >= 0),
  rate_card_id  uuid REFERENCES public.rate_card(id) ON DELETE SET NULL,
  ordem         int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plano_itens_plano ON public.plano_itens (plano_id, ordem);

COMMENT ON COLUMN public.plano_itens.quantidade IS 'Por MÊS. É o que o cliente lê na proposta.';
COMMENT ON COLUMN public.plano_itens.horas_unidade IS 'Horas de UMA unidade. É o que decide a margem.';

-- ------------------------------------------- o plano aplicado a um cliente
CREATE TABLE IF NOT EXISTS public.cliente_planos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plano_id       uuid REFERENCES public.planos(id) ON DELETE SET NULL,
  nome           text NOT NULL,              -- cópia: o catálogo pode ser renomeado
  inicio         date NOT NULL,
  meses          int  NOT NULL CHECK (meses BETWEEN 1 AND 60),
  valor_mensal   numeric NOT NULL DEFAULT 0,
  custo_previsto numeric NOT NULL DEFAULT 0, -- congelado na aplicação (ver cabeçalho)
  status         text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado')),
  observacoes    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cliente_planos_cli ON public.cliente_planos (client_id, status);

/** Último dia coberto pelo contrato — a conta de fim de vigência num lugar só. */
CREATE OR REPLACE FUNCTION public.plano_fim(_inicio date, _meses int)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT (_inicio + make_interval(months => _meses) - interval '1 day')::date
$$;

-- ------------------------------------------------------------- os números
/**
 * O plano com as duas faces somadas.
 *
 * `custo_mensal` usa o custo/hora do rate card AGORA — é catálogo, e catálogo
 * deve refletir o custo de hoje. Item sem função escolhida entra com custo
 * zero e aparece como alerta na tela (horas sem dono de custo mentem a
 * margem pra cima, que é o erro caro).
 */
CREATE OR REPLACE VIEW public.planos_v
WITH (security_invoker = on) AS
SELECT
  p.*,
  COALESCE(i.itens, 0)                                  AS itens,
  COALESCE(i.entregas_mes, 0)                           AS entregas_mes,
  COALESCE(i.horas_mes, 0)                              AS horas_mes,
  COALESCE(i.custo_mensal, 0)                           AS custo_mensal,
  COALESCE(i.horas_sem_funcao, 0)                       AS horas_sem_funcao,
  p.valor_mensal - COALESCE(i.custo_mensal, 0)          AS margem_mensal,
  CASE WHEN p.valor_mensal > 0
       THEN round(((p.valor_mensal - COALESCE(i.custo_mensal, 0)) / p.valor_mensal) * 100, 1)
       ELSE 0 END                                       AS margem_percent,
  COALESCE(p.valor_total, p.valor_mensal * p.duracao_meses)          AS valor_contrato,
  COALESCE(i.custo_mensal, 0) * p.duracao_meses                      AS custo_contrato,
  COALESCE(p.valor_total, p.valor_mensal * p.duracao_meses)
    - COALESCE(i.custo_mensal, 0) * p.duracao_meses                  AS margem_contrato
FROM public.planos p
LEFT JOIN LATERAL (
  SELECT
    count(*)                                                    AS itens,
    sum(pi.quantidade)                                          AS entregas_mes,
    sum(pi.quantidade * pi.horas_unidade)                       AS horas_mes,
    sum(pi.quantidade * pi.horas_unidade * COALESCE(rc.custo_hora, 0)) AS custo_mensal,
    sum(pi.quantidade * pi.horas_unidade) FILTER (WHERE rc.id IS NULL) AS horas_sem_funcao
  FROM public.plano_itens pi
  LEFT JOIN public.rate_card rc ON rc.id = pi.rate_card_id
  WHERE pi.plano_id = p.id
) i ON true;

-- ------------------------------------------------------------------- RLS
ALTER TABLE public.planos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plano_itens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_planos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planos dinheiro" ON public.planos;
CREATE POLICY "planos dinheiro" ON public.planos FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro()) WITH CHECK (public.pode_ver_dinheiro());

DROP POLICY IF EXISTS "plano_itens dinheiro" ON public.plano_itens;
CREATE POLICY "plano_itens dinheiro" ON public.plano_itens FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro()) WITH CHECK (public.pode_ver_dinheiro());

DROP POLICY IF EXISTS "cliente_planos dinheiro" ON public.cliente_planos;
CREATE POLICY "cliente_planos dinheiro" ON public.cliente_planos FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro()) WITH CHECK (public.pode_ver_dinheiro());

GRANT SELECT ON public.planos_v TO authenticated;
GRANT EXECUTE ON FUNCTION public.plano_fim(date, int) TO authenticated;

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int;
BEGIN
  IF public.plano_fim(date '2026-08-01', 12) <> date '2027-07-31' THEN
    RAISE EXCEPTION 'fim do contrato errado: %', public.plano_fim(date '2026-08-01', 12);
  END IF;

  BEGIN
    DECLARE
      _p uuid; _rc uuid; _custo numeric; _v record;
    BEGIN
      -- Uma função real do rate card, com custo real.
      SELECT id INTO _rc FROM public.rate_card WHERE ativo AND COALESCE(custo_hora, 0) > 0 ORDER BY ordem LIMIT 1;
      IF _rc IS NULL THEN RAISE EXCEPTION 'RESULTADO:rate_card sem função com custo — nada a medir'; END IF;
      SELECT custo_hora INTO _custo FROM public.rate_card WHERE id = _rc;

      INSERT INTO public.planos (nome, duracao_meses, valor_mensal)
      VALUES ('__teste__ Essencial', 12, 8000) RETURNING id INTO _p;

      -- 4 vídeos × 5h (com função) + 2 reels × 2h (SEM função escolhida)
      INSERT INTO public.plano_itens (plano_id, descricao, quantidade, horas_unidade, rate_card_id, ordem)
      VALUES (_p, '4 vídeos de 1min', 4, 5, _rc, 1),
             (_p, '2 reels',          2, 2, NULL, 2);

      SELECT * INTO _v FROM public.planos_v WHERE id = _p;

      -- As duas faces do mesmo escopo.
      IF _v.entregas_mes <> 6 THEN RAISE EXCEPTION 'RESULTADO:entregas/mês deu %', _v.entregas_mes; END IF;
      IF _v.horas_mes <> 24 THEN RAISE EXCEPTION 'RESULTADO:horas/mês deu %', _v.horas_mes; END IF;

      -- Só as horas COM função entram no custo (4×5 = 20h).
      IF _v.custo_mensal <> 20 * _custo THEN
        RAISE EXCEPTION 'RESULTADO:custo mensal deu % (esperado %)', _v.custo_mensal, 20 * _custo;
      END IF;
      -- E as 4h sem função aparecem, em vez de sumirem inflando a margem.
      IF _v.horas_sem_funcao <> 4 THEN
        RAISE EXCEPTION 'RESULTADO:horas sem função deu %', _v.horas_sem_funcao;
      END IF;

      IF _v.margem_mensal <> 8000 - 20 * _custo THEN
        RAISE EXCEPTION 'RESULTADO:margem mensal deu %', _v.margem_mensal;
      END IF;
      IF _v.valor_contrato <> 96000 THEN
        RAISE EXCEPTION 'RESULTADO:valor do contrato deu % (esperado 96000)', _v.valor_contrato;
      END IF;
      IF _v.margem_contrato <> 96000 - 20 * _custo * 12 THEN
        RAISE EXCEPTION 'RESULTADO:margem do contrato deu %', _v.margem_contrato;
      END IF;

      -- Desconto à vista: valor_total preenchido MANDA sobre mensal × meses.
      UPDATE public.planos SET valor_total = 90000 WHERE id = _p;
      SELECT * INTO _v FROM public.planos_v WHERE id = _p;
      IF _v.valor_contrato <> 90000 THEN
        RAISE EXCEPTION 'RESULTADO:valor_total não prevaleceu (deu %)', _v.valor_contrato;
      END IF;

      _res := format('ok · custo/hora %s', _custo);
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res NOT LIKE 'ok%' THEN RAISE EXCEPTION 'planos: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.planos WHERE nome LIKE '\_\_teste\_\_%';
  IF _sobrou > 0 THEN RAISE EXCEPTION 'plano de teste persistiu (%)', _sobrou; END IF;

  RAISE NOTICE 'planos: entregas e horas nas duas faces, custo pelo rate card, contrato somado — %', _res;
END $medicao$;
