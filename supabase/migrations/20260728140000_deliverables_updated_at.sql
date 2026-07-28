-- =========================================================================
-- deliverables.updated_at não era mantido por ninguém.
--
-- Nem o fluxo (lib/fluxoEntregavel nunca escreve a coluna) nem trigger. Na
-- prática ela guardava a data da IMPORTAÇÃO do ClickUp, não a da última
-- mexida. A seção "Parado esperando alguém" da Minha mesa conta os dias em
-- cima dela — sem isso, "há 8 dias" mede a coisa errada e vai mentindo mais
-- a cada semana.
--
-- Trigger em vez de acertar cada caminho de escrita no app: quem escreve são
-- o fluxo, o portal, as funções de aprovação e o que vier depois. Corrigir um
-- por um deixaria o próximo de fora.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deliverables_updated_at ON public.deliverables;
CREATE TRIGGER trg_deliverables_updated_at
  BEFORE UPDATE ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

COMMENT ON COLUMN public.deliverables.updated_at IS
  'Última alteração da linha, mantida por trigger. É a base do "parado há N dias" na Minha mesa.';
