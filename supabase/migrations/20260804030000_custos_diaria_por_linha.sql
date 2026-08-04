-- =========================================================================
-- Custo de diária lançado LINHA A LINHA
--
-- Hoje são três campos: Logística, Alimentação, Hospedagem. Quem lança tem
-- que somar de cabeça — aluguel + combustível + pedágio — e escrever o total.
-- Some errado e ninguém descobre; some certo e daqui a dois meses ninguém
-- lembra o que estava dentro daqueles R$ 520.
--
-- `custos_itens` guarda as linhas: [{cat, descricao, valor}]. Os três campos
-- numéricos CONTINUAM existindo e viram TOTAL DERIVADO — cinco telas já leem
-- eles (view de rateio, fechamento, faturamento mensal, relatório do cliente,
-- ficha do projeto), e trocar isso por um join em jsonb seria reescrever o
-- que já funciona pra ganhar nada.
--
-- Um trigger mantém os dois lados em sincronia: mexeu nas linhas, o total é
-- refeito. Total e detalhe não podem divergir — se divergirem, o número que
-- vai pro cliente deixa de ter origem.
-- =========================================================================

ALTER TABLE public.producao_saidas
  ADD COLUMN IF NOT EXISTS custos_itens jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.producao_saidas.custos_itens IS
  'Linhas de custo: [{cat:logistica|alimentacao|hospedagem, descricao, valor}]. '
  'Os campos custo_* são o total derivado daqui (trigger diaria_soma_custos).';

/**
 * Soma as linhas por categoria e escreve nos campos de total.
 *
 * Só recalcula quando as LINHAS mudaram. Assim quem ainda lança direto no
 * campo numérico (ou um registro antigo, sem linhas) não tem o valor zerado
 * por um trigger que não foi chamado pra isso.
 */
CREATE OR REPLACE FUNCTION public.diaria_soma_custos()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  mudou boolean;
BEGIN
  mudou := TG_OP = 'INSERT'
        OR NEW.custos_itens IS DISTINCT FROM OLD.custos_itens;

  IF NOT mudou THEN
    RETURN NEW;
  END IF;

  -- Sem linhas nenhuma no INSERT: respeita o que veio nos campos (import,
  -- lançamento direto). Com linhas, elas mandam.
  IF TG_OP = 'INSERT' AND COALESCE(jsonb_array_length(NEW.custos_itens), 0) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN i->>'cat' = 'logistica'   THEN (i->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN i->>'cat' = 'alimentacao' THEN (i->>'valor')::numeric END), 0),
    COALESCE(SUM(CASE WHEN i->>'cat' = 'hospedagem'  THEN (i->>'valor')::numeric END), 0)
    INTO NEW.custo_logistica, NEW.custo_alimentacao, NEW.custo_hospedagem
    FROM jsonb_array_elements(COALESCE(NEW.custos_itens, '[]'::jsonb)) i;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_diaria_soma_custos ON public.producao_saidas;
CREATE TRIGGER trg_diaria_soma_custos
  BEFORE INSERT OR UPDATE ON public.producao_saidas
  FOR EACH ROW EXECUTE FUNCTION public.diaria_soma_custos();

-- Diárias que já têm total lançado ganham uma linha só, com o valor que
-- estava lá. Sem isso, abrir uma diária antiga mostraria "nenhum item" ao
-- lado de um total de R$ 800 — e a primeira edição zeraria o total.
UPDATE public.producao_saidas s
   SET custos_itens = (
     SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
       SELECT jsonb_build_object('cat','logistica','descricao','Lançado antes do detalhamento','valor',s.custo_logistica) AS x
        WHERE s.custo_logistica > 0
       UNION ALL
       SELECT jsonb_build_object('cat','alimentacao','descricao','Lançado antes do detalhamento','valor',s.custo_alimentacao)
        WHERE s.custo_alimentacao > 0
       UNION ALL
       SELECT jsonb_build_object('cat','hospedagem','descricao','Lançado antes do detalhamento','valor',s.custo_hospedagem)
        WHERE s.custo_hospedagem > 0
     ) t
   )
 WHERE COALESCE(jsonb_array_length(s.custos_itens), 0) = 0
   AND (s.custo_logistica > 0 OR s.custo_alimentacao > 0 OR s.custo_hospedagem > 0);
