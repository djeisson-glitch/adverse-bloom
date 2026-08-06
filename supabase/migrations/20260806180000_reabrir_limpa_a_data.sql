-- =========================================================================
-- Reabrir um negócio deixava a data de perda/ganho pra trás
--
-- O indicador novo mostrou "PERDIDOS 2 · R$ 58.700" com UM card na coluna
-- Perdido. Investigando:
--
--   [0307]_VESTIBULAR_27              stage perdido   lost_at 05/08   ✓
--   [SICREDI SUL] Animação robo em IA stage ACEITE    lost_at 05/08   ✗
--
-- O segundo fui eu: marquei como perdido pra provar que o link público
-- continuava no ar depois da recusa, e reverti o stage em seguida. O stage
-- voltou; o `lost_at`, não — nada limpa. Meu teste sujou o indicador dele.
--
-- Mas o defeito não é do teste: QUALQUER reabertura deixa esse rastro. Um
-- negócio dado por perdido em março e reaberto em abril seguiria contando
-- como perda de março pra sempre, e a taxa de conversão nasceria errada sem
-- ninguém ter feito nada de errado.
--
-- `tg_deal_stage_followup` já carimba won_at/lost_at ao ENTRAR nos estados.
-- Faltava o outro lado: limpar ao SAIR. Reconstruído a partir da definição
-- vigente (20260806080000), que traz o follow-up em dia útil.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_deal_stage_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg record;
  dias int;
  tipo_fu text;
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    -- SAIU de perdido: a perda não aconteceu. Idem pro ganho. Sem isto, a
    -- data antiga fica e o negócio conta duas vezes no histórico.
    IF OLD.stage = 'perdido' AND NEW.stage <> 'perdido' THEN
      NEW.lost_at := NULL;
    END IF;
    IF OLD.stage IN ('aceite', 'fechado_ganho') AND NEW.stage NOT IN ('aceite', 'fechado_ganho') THEN
      NEW.won_at := NULL;
    END IF;
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage IN ('aceite','perdido') THEN
    SELECT followup_won_days, followup_lost_days INTO cfg
      FROM public.commercial_settings LIMIT 1;

    IF NEW.stage = 'aceite' THEN
      dias := COALESCE(cfg.followup_won_days, 60);
      tipo_fu := 'pos_ganho';
      NEW.won_at := now();
    ELSE
      dias := COALESCE(cfg.followup_lost_days, 60);
      tipo_fu := 'pos_perda';
      NEW.lost_at := now();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.follow_ups
      WHERE deal_id = NEW.id AND tipo = tipo_fu AND status = 'pendente'
    ) THEN
      INSERT INTO public.follow_ups (deal_id, data_prevista, tipo, descricao, responsavel_id)
      VALUES (
        NEW.id,
        public.proximo_dia_util((CURRENT_DATE + dias * INTERVAL '1 day')::date),
        tipo_fu,
        CASE WHEN tipo_fu = 'pos_ganho'
             THEN 'Reabordar cliente ' || dias || ' dias após fechamento (upsell/recompra).'
             ELSE 'Reabordar cliente ' || dias || ' dias após perda (reativação).' END,
        NEW.created_by
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_stage_followup ON public.deals;
CREATE TRIGGER trg_deal_stage_followup
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_deal_stage_followup();

-- --------------------------------------------------- limpeza do que já sujou
UPDATE public.deals
   SET lost_at = NULL
 WHERE stage <> 'perdido' AND lost_at IS NOT NULL;

UPDATE public.deals
   SET won_at = NULL
 WHERE stage NOT IN ('aceite', 'fechado_ganho') AND won_at IS NOT NULL;

-- ---------------------------------------------------------------- medição
DO $$
DECLARE ruim int; perdidos int; ganhos int;
BEGIN
  SELECT count(*) INTO ruim FROM public.deals
   WHERE (stage <> 'perdido' AND lost_at IS NOT NULL)
      OR (stage NOT IN ('aceite','fechado_ganho') AND won_at IS NOT NULL);
  IF ruim > 0 THEN RAISE EXCEPTION 'ainda há % deals com data incoerente com o stage', ruim; END IF;

  SELECT count(*) INTO perdidos FROM public.deals WHERE lost_at IS NOT NULL;
  SELECT count(*) INTO ganhos   FROM public.deals WHERE won_at IS NOT NULL;
  RAISE NOTICE 'datas coerentes com o stage · com lost_at: % · com won_at: %', perdidos, ganhos;
END $$;
