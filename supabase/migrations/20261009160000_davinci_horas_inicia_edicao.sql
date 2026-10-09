BEGIN;
CREATE OR REPLACE FUNCTION public.tg_hora_tira_do_pendente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deliverable_id IS NULL OR COALESCE(NEW.duration_min, 0) <= 0 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.duration_min <= OLD.duration_min THEN RETURN NEW; END IF;
  END IF;
  IF NEW.source = 'davinci' THEN
    UPDATE public.deliverables SET status = 'em_edicao', updated_at = now()
    WHERE id = NEW.deliverable_id
      AND status IN ('pendente', 'pronto_editar', 'em_pausa', 'ajuste_interno', 'ajuste_solicitado');
  ELSIF TG_OP = 'INSERT' THEN
    UPDATE public.deliverables SET status = 'em_pausa', updated_at = now()
    WHERE id = NEW.deliverable_id AND status = 'pendente';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hora_tira_do_pendente ON public.time_entries;
CREATE TRIGGER trg_hora_tira_do_pendente AFTER INSERT OR UPDATE OF duration_min ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.tg_hora_tira_do_pendente();
DO $test$
DECLARE result text; p uuid; u uuid; d uuid; e uuid; s text; expected text;
BEGIN
 BEGIN
  SELECT id INTO p FROM public.projects LIMIT 1;
  SELECT id INTO u FROM public.profiles LIMIT 1;
  IF p IS NULL OR u IS NULL THEN RAISE EXCEPTION 'No fixtures available'; END IF;
  INSERT INTO public.deliverables(project_id,titulo,status) VALUES(p,'Teste transitório DaVinci','pendente') RETURNING id INTO d;
  INSERT INTO public.time_entries(user_id,project_id,deliverable_id,start_at,duration_min,source)
    VALUES(u,p,d,now(),0,'davinci') RETURNING id INTO e;
  SELECT status INTO s FROM public.deliverables WHERE id=d;
  IF s <> 'pendente' THEN RAISE EXCEPTION 'Zero duration moved status'; END IF;
  UPDATE public.time_entries SET duration_min=1 WHERE id=e;
  SELECT status INTO s FROM public.deliverables WHERE id=d;
  IF s <> 'em_edicao' THEN RAISE EXCEPTION 'DaVinci update did not start editing'; END IF;
  FOREACH expected IN ARRAY ARRAY['em_pausa','ajuste_interno','ajuste_solicitado','pronto_editar','revisao_n1','com_cliente','aprovado','entregue'] LOOP
   UPDATE public.deliverables SET status=expected WHERE id=d;
   UPDATE public.time_entries SET duration_min=duration_min+1 WHERE id=e;
   SELECT status INTO s FROM public.deliverables WHERE id=d;
   IF s <> (CASE WHEN expected IN ('em_pausa','ajuste_interno','ajuste_solicitado','pronto_editar') THEN 'em_edicao' ELSE expected END) THEN
    RAISE EXCEPTION 'Unexpected transition from % to %',expected,s;
   END IF;
  END LOOP;
  UPDATE public.deliverables SET status='pendente' WHERE id=d;
  INSERT INTO public.time_entries(user_id,project_id,deliverable_id,start_at,duration_min,source) VALUES(u,p,d,now(),1,'davinci');
  SELECT status INTO s FROM public.deliverables WHERE id=d;
  IF s <> 'em_edicao' THEN RAISE EXCEPTION 'DaVinci insert did not start editing'; END IF;
  UPDATE public.deliverables SET status='pendente' WHERE id=d;
  INSERT INTO public.time_entries(user_id,project_id,deliverable_id,start_at,duration_min,source) VALUES(u,p,d,now(),1,'manual');
  SELECT status INTO s FROM public.deliverables WHERE id=d;
  IF s <> 'em_pausa' THEN RAISE EXCEPTION 'Manual entry changed behavior'; END IF;
  RAISE EXCEPTION USING MESSAGE='DAVINCI_TEST_ROLLBACK';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'DAVINCI_TEST_ROLLBACK' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'DaVinci insert/update and protected statuses verified; fixtures rolled back';
END $test$;

COMMIT;
