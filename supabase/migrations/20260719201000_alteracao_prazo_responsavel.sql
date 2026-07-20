-- Toda alteração do cliente nasce com prazo de 1 dia e com o MESMO responsável
-- da edição do entregável. Antes só um dos três caminhos de criação preenchia
-- o responsável, e nenhum punha prazo — a alteração ficava órfã, sem dono nem
-- data, e sumia da mesa de quem tinha que fazer.
--
-- Trigger em vez de arrumar cada INSERT: o portal do cliente é SECURITY DEFINER
-- e roda como anon; garantir no banco cobre portal + app de uma vez só.
CREATE OR REPLACE FUNCTION public.alteracao_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Herdar o responsável da edição só faz sentido pra alteração do cliente;
  -- ajuste interno pode ter dono próprio. Mas se vier vazio, herda de qualquer forma.
  IF NEW.responsavel_id IS NULL THEN
    SELECT responsavel_id INTO NEW.responsavel_id
      FROM public.deliverables WHERE id = NEW.deliverable_id;
  END IF;
  -- Prazo curto de propósito: alteração é acerto rápido, não recomeço.
  IF NEW.prazo IS NULL THEN
    NEW.prazo := current_date + 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_alteracao_defaults ON public.deliverable_alteracoes;
CREATE TRIGGER trg_alteracao_defaults
  BEFORE INSERT ON public.deliverable_alteracoes
  FOR EACH ROW EXECUTE FUNCTION public.alteracao_defaults();
