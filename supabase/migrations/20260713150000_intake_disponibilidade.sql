-- =========================================================================
-- Disponibilidade ao vivo no formulário de demandas
--  • intake_calc: extrai o cálculo de viabilidade (fila do editor + edição +
--    revisão, projetado em horário comercial) num só lugar.
--  • intake_disponibilidade: endpoint público read-only (não grava) pra
--    checar o prazo enquanto o cliente escolhe a data/hora.
--  • intake_submit passa a usar intake_calc (mesmo resultado, sem divergência).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.intake_calc(_client_id uuid, _n_entregas int, _prazo timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c          record;
  editor     uuid;
  edit_h     numeric;
  rev_h      numeric;
  n          int;
  demanda_h  numeric;
  carga      numeric := 0;
  cnt        int;
  th         numeric;
  total_h    numeric;
  earliest   timestamptz;
  no_prazo   boolean;
BEGIN
  SELECT * INTO c FROM public.clients WHERE id = _client_id LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  editor := c.intake_editor_id;
  edit_h := coalesce(c.intake_edit_horas, 4);
  rev_h  := coalesce(c.intake_revisao_horas, 2);
  n := GREATEST(coalesce(_n_entregas, 1), 1);
  demanda_h := n * edit_h;

  IF editor IS NOT NULL AND _prazo IS NOT NULL THEN
    SELECT count(*) INTO cnt
      FROM public.deliverables d
     WHERE d.responsavel_id = editor
       AND coalesce(d.status, '') NOT IN ('aprovado','entregue','concluido','cancelado','arquivado')
       AND d.data_entrega IS NOT NULL
       AND d.data_entrega <= _prazo::date;
    carga := carga + coalesce(cnt, 0) * edit_h;

    SELECT coalesce(sum(estimativa_horas), 0) INTO th
      FROM public.tasks
     WHERE assigned_user_id = editor
       AND coalesce(completed, false) = false
       AND coalesce(status, '') NOT IN ('done','concluido','completed','cancelado')
       AND due_date IS NOT NULL
       AND due_date <= _prazo::date;
    carga := carga + coalesce(th, 0);
  END IF;

  total_h  := carga + demanda_h + rev_h;
  earliest := public.intake_add_business_hours(now(), total_h);
  no_prazo := (_prazo IS NOT NULL) AND (earliest <= _prazo);

  RETURN jsonb_build_object(
    'earliest',      earliest,
    'no_prazo',      no_prazo,
    'carga_horas',   round(carga, 1),
    'demanda_horas', round(demanda_h, 1),
    'revisao_horas', round(rev_h, 1),
    'total_horas',   round(total_h, 1),
    'sem_editor',    editor IS NULL
  );
END;
$$;

-- Endpoint público read-only: checa disponibilidade por slug (não grava nada).
CREATE OR REPLACE FUNCTION public.intake_disponibilidade(_slug text, _n_entregas int, _prazo timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  SELECT id INTO cid FROM public.clients WHERE intake_slug = _slug AND intake_ativo LIMIT 1;
  IF cid IS NULL THEN RETURN NULL; END IF;
  RETURN public.intake_calc(cid, _n_entregas, _prazo);
END;
$$;

-- intake_submit agora usa intake_calc (mesmo número que o cliente viu ao vivo).
CREATE OR REPLACE FUNCTION public.intake_submit(
  _slug text, _nome text, _email text, _projeto text,
  _entregas jsonb, _prazo timestamptz, _anexos jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c          record;
  n_entregas int;
  nova_id    uuid;
  viab       jsonb;
BEGIN
  SELECT * INTO c FROM public.clients WHERE intake_slug = _slug LIMIT 1;
  IF NOT FOUND OR NOT c.intake_ativo THEN
    RAISE EXCEPTION 'Formulário não encontrado';
  END IF;
  IF coalesce(btrim(_nome), '') = '' OR coalesce(btrim(_email), '') = ''
     OR coalesce(btrim(_projeto), '') = '' THEN
    RAISE EXCEPTION 'Preencha nome, e-mail e nome do projeto';
  END IF;

  n_entregas := CASE WHEN jsonb_typeof(_entregas) = 'array' THEN jsonb_array_length(_entregas) ELSE 0 END;
  viab := public.intake_calc(c.id, n_entregas, _prazo);

  INSERT INTO public.demandas
    (client_id, solicitante_nome, solicitante_email, nome_projeto, entregas, prazo_desejado, anexos, viabilidade)
  VALUES
    (c.id, _nome, _email, _projeto,
     coalesce(_entregas, '[]'::jsonb), _prazo, coalesce(_anexos, '[]'::jsonb), viab)
  RETURNING id INTO nova_id;

  RETURN jsonb_build_object('ok', true, 'demanda_id', nova_id) || coalesce(viab, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.intake_disponibilidade(text, int, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_submit(text, text, text, text, jsonb, timestamptz, jsonb) TO anon, authenticated;
