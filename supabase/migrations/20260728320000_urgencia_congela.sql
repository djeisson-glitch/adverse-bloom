-- Congela a urgência no INSERT da demanda, no banco.
--
-- Trigger e não no intake_submit: o formulário é público e a decisão de
-- cobrar não pode depender do que o navegador do cliente mandou. Aqui o
-- servidor decide, com a data pedida e a configuração do cliente, no instante
-- do pedido — e fica gravado.
CREATE OR REPLACE FUNCTION public.tg_demanda_urgencia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pct numeric;
BEGIN
  IF NEW.client_id IS NULL OR NEW.prazo_desejado IS NULL THEN RETURN NEW; END IF;

  IF public.intake_e_urgente(NEW.client_id, NEW.prazo_desejado) THEN
    SELECT urgencia_percentual INTO pct FROM public.clients WHERE id = NEW.client_id;
    NEW.urgente := true;
    NEW.urgencia_percentual := pct;
  ELSE
    NEW.urgente := false;
    NEW.urgencia_percentual := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_demanda_urgencia ON public.demandas;
CREATE TRIGGER trg_demanda_urgencia
  BEFORE INSERT ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.tg_demanda_urgencia();

-- O projeto herda o que foi combinado no pedido: é lá que a hora vai ser
-- rastreada e faturada.
CREATE OR REPLACE FUNCTION public.tg_projeto_herda_urgencia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.demanda_id IS NOT NULL THEN
    SELECT d.urgente, d.urgencia_percentual
      INTO NEW.urgente, NEW.urgencia_percentual
      FROM public.demandas d WHERE d.id = NEW.demanda_id;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='projects' AND column_name='demanda_id') THEN
    DROP TRIGGER IF EXISTS trg_projeto_herda_urgencia ON public.projects;
    CREATE TRIGGER trg_projeto_herda_urgencia
      BEFORE INSERT ON public.projects
      FOR EACH ROW EXECUTE FUNCTION public.tg_projeto_herda_urgencia();
  END IF;
END $$;
