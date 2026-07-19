-- =====================================================================
-- Lançar horas manualmente (inclusive retroativo). Admin/manager pode
-- lançar PARA OUTRA PESSOA — a trava fica no banco (RLS de time_entries só
-- deixa cada um inserir pra si; esta função SECURITY DEFINER abre a exceção
-- controlada). Qualquer autenticado lança pra si mesmo por aqui também.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.lancar_horas_manual(
  _project_id     uuid,
  _start_at       timestamptz,
  _duration_min   int,
  _description    text DEFAULT NULL,
  _billable       boolean DEFAULT true,
  _user_id        uuid DEFAULT NULL,
  _deliverable_id uuid DEFAULT NULL,
  _task_id        uuid DEFAULT NULL,
  _alteracao_id   uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid;
  _novo uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'não autenticado'; END IF;
  _uid := COALESCE(_user_id, auth.uid());

  -- lançar pra outra pessoa: só admin/manager
  IF _uid <> auth.uid()
     AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'só admin pode lançar horas para outra pessoa';
  END IF;

  IF _project_id IS NULL THEN RAISE EXCEPTION 'projeto é obrigatório'; END IF;
  IF _duration_min IS NULL OR _duration_min <= 0 THEN RAISE EXCEPTION 'duração inválida'; END IF;

  INSERT INTO public.time_entries
    (user_id, project_id, deliverable_id, task_id, alteracao_id, start_at, duration_min, description, billable, source)
  VALUES
    (_uid, _project_id, _deliverable_id, _task_id, _alteracao_id,
     COALESCE(_start_at, now()), _duration_min, NULLIF(btrim(_description), ''),
     COALESCE(_billable, true), 'manual')
  RETURNING id INTO _novo;

  RETURN _novo;
END; $$;

GRANT EXECUTE ON FUNCTION public.lancar_horas_manual(uuid, timestamptz, int, text, boolean, uuid, uuid, uuid, uuid) TO authenticated;
