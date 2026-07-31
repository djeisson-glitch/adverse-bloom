-- A hora carimba a etapa vigente da peça, no banco.
--
-- Trigger e não no app: quem cria hora é o cronômetro, o lançamento manual, a
-- correção do admin e o importador do ClickUp. Fazer no cliente deixaria três
-- desses de fora — e a pergunta "quem fez o quê" só vale se a resposta for
-- completa.
--
-- Ninguém escolhe etapa em lugar nenhum: ela vem do estado da peça.
CREATE OR REPLACE FUNCTION public.tg_hora_carimba_etapa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.etapa IS NULL AND NEW.deliverable_id IS NOT NULL THEN
    SELECT d.etapa_atual INTO NEW.etapa
      FROM public.deliverables d WHERE d.id = NEW.deliverable_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hora_carimba_etapa ON public.time_entries;
CREATE TRIGGER trg_hora_carimba_etapa
  BEFORE INSERT ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_hora_carimba_etapa();
