-- =========================================================================
-- Onda 2 · Comercial — stages Catalunya, trigger follow-up automático,
-- view de previsão ponderada, migração dos deals existentes.
-- =========================================================================

-- ---------- 1. Stages Catalunya no commercial_settings ----------------------
UPDATE public.commercial_settings
SET pipeline_stages = '[
  {"id":"lead","label":"Lead / Pedido Recebido","color":"#22c55e","probability":10,"emoji":"🟢"},
  {"id":"elaboracao","label":"Em Elaboração","color":"#f59e0b","probability":40,"emoji":"✍️"},
  {"id":"proposta","label":"Proposta Enviada","color":"#3b82f6","probability":60,"emoji":"📬"},
  {"id":"negociacao","label":"Negociação","color":"#a855f7","probability":80,"emoji":"🤝"},
  {"id":"aceite","label":"Aceite","color":"#10b981","probability":100,"emoji":"✅"}
]'::jsonb,
    followup_won_days = 60,
    followup_lost_days = 60,
    updated_at = now();

-- ---------- 2. Migrar stages antigos dos deals ------------------------------
-- Renomeia stages legados pro formato Catalunya
UPDATE public.deals SET stage = 'lead'       WHERE stage IN ('contato','contato_inicial','diagnostico');
UPDATE public.deals SET stage = 'elaboracao' WHERE stage IN ('orcamento','orcamento_em_elaboracao');
UPDATE public.deals SET stage = 'aceite'     WHERE stage IN ('ganho','fechamento');
-- 'perdido' e 'proposta' ficam; 'negociacao' é novo (nenhum deal legado usa)

-- Popula probability baseado no stage se estiver com o default 50
UPDATE public.deals SET probability = CASE stage
  WHEN 'lead' THEN 10
  WHEN 'elaboracao' THEN 40
  WHEN 'proposta' THEN 60
  WHEN 'negociacao' THEN 80
  WHEN 'aceite' THEN 100
  WHEN 'perdido' THEN 0
  ELSE probability
END
WHERE probability = 50 OR probability IS NULL;

-- Adiciona timestamps de decisão (usados no trigger)
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS won_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_at timestamptz;

-- ---------- 3. Trigger de follow-up automático ------------------------------
-- Ao mudar stage pra 'aceite' ou 'perdido', cria um follow_up +N dias
CREATE OR REPLACE FUNCTION public.tg_deal_stage_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg record;
  dias int;
  tipo_fu text;
BEGIN
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

    -- Evita duplicar follow-up automático pro mesmo deal+tipo
    IF NOT EXISTS (
      SELECT 1 FROM public.follow_ups
      WHERE deal_id = NEW.id AND tipo = tipo_fu AND status = 'pendente'
    ) THEN
      INSERT INTO public.follow_ups (deal_id, data_prevista, tipo, descricao, responsavel_id)
      VALUES (
        NEW.id,
        (CURRENT_DATE + dias * INTERVAL '1 day')::date,
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

-- ---------- 4. View de previsão ponderada -----------------------------------
-- Pipeline aberto ponderado por probabilidade do stage.
CREATE OR REPLACE VIEW public.v_previsao_pipeline AS
SELECT
  d.stage,
  COUNT(*)::int                                       AS n_deals,
  COALESCE(SUM(d.value), 0)::numeric                  AS valor_total,
  COALESCE(SUM(d.value * d.probability / 100.0), 0)::numeric AS valor_ponderado,
  AVG(d.probability)::int                             AS prob_media
FROM public.deals d
WHERE d.stage NOT IN ('aceite','perdido')
GROUP BY d.stage;

-- ---------- 5. Índices auxiliares -------------------------------------------
CREATE INDEX IF NOT EXISTS idx_deals_stage ON public.deals (stage);
CREATE INDEX IF NOT EXISTS idx_deals_won_at ON public.deals (won_at) WHERE won_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_lost_at ON public.deals (lost_at) WHERE lost_at IS NOT NULL;
