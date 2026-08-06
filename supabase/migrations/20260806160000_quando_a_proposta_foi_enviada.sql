-- =========================================================================
-- Quando a proposta foi enviada — o dado que faltava pra medir o comercial
--
-- "orçamentos enviados no período" não tinha como ser respondido: o sistema
-- só guarda o stage ATUAL. Quando o link do cliente é copiado, o código faz
-- `UPDATE deals SET stage = 'proposta'` e pronto — a data se perde, e um deal
-- que hoje está em 'aceite' não tem como dizer em que mês a proposta saiu.
--
-- Sem isso, qualquer indicador de "enviados por mês" seria contagem do stage
-- atual: um número que muda de mês retroativamente conforme os negócios
-- andam no funil. Pior que não ter.
--
-- `won_at` e `lost_at` já existem e são gravados por trigger; esta é a
-- terceira data do mesmo trio, e faltava.
--
-- O PASSADO fica null, de propósito. Não dá pra inventar a data de envio de
-- quem já está em negociação — a tela usa a criação do orçamento como
-- referência declarada nesses casos, em vez de fingir precisão.
-- =========================================================================

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS proposta_em timestamptz;

COMMENT ON COLUMN public.deals.proposta_em IS
  'Quando a proposta foi enviada ao cliente (primeira vez que o deal entrou '
  'em ''proposta''). Null nos anteriores à coluna — ver indicadores.';

/**
 * Carimba na primeira vez, e só na primeira.
 *
 * Reabrir um negócio e mandar de novo NÃO reescreve a data: a pergunta que o
 * indicador responde é "quando este orçamento entrou no mercado", e essa
 * acontece uma vez. Reenvio é outra coisa, e teria que ser outra coluna.
 */
CREATE OR REPLACE FUNCTION public.tg_deal_proposta_em()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage = 'proposta'
     AND (TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage)
     AND NEW.proposta_em IS NULL THEN
    NEW.proposta_em := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deal_proposta_em ON public.deals;
CREATE TRIGGER trg_deal_proposta_em
  BEFORE INSERT OR UPDATE OF stage ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_deal_proposta_em();

-- ---------------------------------------------------------------- medição
DO $$
DECLARE
  total int; com_data int; adiante int;
BEGIN
  SELECT count(*) INTO total FROM public.deals;
  SELECT count(*) INTO com_data FROM public.deals WHERE proposta_em IS NOT NULL;
  -- Quantos já passaram de proposta e portanto ficarão sem a data: é o
  -- tamanho do buraco que a tela vai precisar declarar.
  SELECT count(*) INTO adiante FROM public.deals
   WHERE stage IN ('proposta','negociacao','aceite','fechado_ganho','perdido')
     AND proposta_em IS NULL;
  RAISE NOTICE 'deals: % | já com proposta_em: % | sem a data (anteriores): %',
    total, com_data, adiante;
END $$;
