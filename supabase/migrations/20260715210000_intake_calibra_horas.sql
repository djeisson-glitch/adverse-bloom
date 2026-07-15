-- =========================================================================
-- Intake aprende as HORAS REAIS de cada cliente (o "tamanho do simples")
--
--  O prazo já escalava por duração e por rodadas de alteração. Mas a hora-base
--  de edição (intake_edit_horas) era um chute fixo. Quando o cliente chama de
--  "simples" algo que sempre leva 6h, o sistema não sabia — e o editor comia a
--  diferença.
--
--  Agora o sistema calibra: compara as HORAS DE EDIÇÃO PURA que o timesheet
--  registrou (time_entries com alteracao_id NULL — alteração é contada à parte
--  pelo mecanismo de rodadas) com o que teria estimado, e aprende o multiplicador
--  real daquele cliente. Sul Minas cujo "simples" dá 1,9× o padrão passa a
--  receber um prazo honesto na hora do pedido.
--
--  Salvaguardas: precisa de ≥3 entregáveis com horas (senão não calibra), e o
--  fator é limitado a [0,5 ; 3,0] pra um outlier não explodir a conta.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.intake_client_calib(_client_id uuid, _edit_h numeric)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fator numeric;
  n     int;
BEGIN
  IF _client_id IS NULL OR coalesce(_edit_h, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  WITH horas AS (
    SELECT d.id,
           d.duracao,
           SUM(te.duration_min) FILTER (WHERE te.alteracao_id IS NULL) / 60.0 AS h_edicao
      FROM public.deliverables d
      JOIN public.projects p     ON p.id = d.project_id
      JOIN public.time_entries te ON te.deliverable_id = d.id
     WHERE p.client_id = _client_id
     GROUP BY d.id, d.duracao
    HAVING SUM(te.duration_min) FILTER (WHERE te.alteracao_id IS NULL) > 0
  ),
  ratios AS (
    SELECT h_edicao
             / NULLIF(_edit_h * public.intake_entrega_fator(jsonb_build_object('duracao', duracao)), 0) AS r
      FROM horas
  )
  SELECT round(avg(r)::numeric, 2), count(*) INTO fator, n
    FROM ratios WHERE r IS NOT NULL;

  IF coalesce(n, 0) < 3 THEN
    RETURN NULL;                                      -- amostra pequena: não calibra
  END IF;
  RETURN LEAST(GREATEST(coalesce(fator, 1), 0.5), 3.0);  -- clamp contra outlier
END;
$$;
GRANT EXECUTE ON FUNCTION public.intake_client_calib(uuid, numeric) TO anon, authenticated;

-- ---- intake_calc: aplica a calibração na hora de edição ------------------
CREATE OR REPLACE FUNCTION public.intake_calc(_client_id uuid, _entregas jsonb, _prazo timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c            record;
  editor       uuid;
  edit_h       numeric;
  rev_h        numeric;
  n            int;
  demanda_h    numeric := 0;
  soma_f       numeric := 0;
  fator_med    numeric := 1;
  rounds_hist  numeric;
  rounds       numeric;
  revisao_h    numeric;
  carga        numeric := 0;
  cnt          int;
  th           numeric;
  total_h      numeric;
  earliest     timestamptz;
  no_prazo     boolean;
  ent          jsonb;
  f            numeric;
  complexidade text;
  calib        numeric;
BEGIN
  SELECT * INTO c FROM public.clients WHERE id = _client_id LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  editor := c.intake_editor_id;
  edit_h := coalesce(c.intake_edit_horas, 4);
  rev_h  := coalesce(c.intake_revisao_horas, 2);

  IF jsonb_typeof(_entregas) = 'array' AND jsonb_array_length(_entregas) > 0 THEN
    n := jsonb_array_length(_entregas);
    FOR ent IN SELECT value FROM jsonb_array_elements(_entregas) LOOP
      f := public.intake_entrega_fator(ent);
      soma_f := soma_f + f;
      demanda_h := demanda_h + edit_h * f;
    END LOOP;
    fator_med := round(soma_f / n, 2);
  ELSE
    n := 1;
    demanda_h := edit_h;
    fator_med := 1;
  END IF;

  complexidade := CASE WHEN fator_med >= 2.4 THEN 'alta'
                       WHEN fator_med >= 1.3 THEN 'média'
                       ELSE 'baixa' END;

  -- >>> calibração pelo histórico real de horas de edição do cliente
  calib := coalesce(public.intake_client_calib(_client_id, edit_h), 1);
  demanda_h := demanda_h * calib;

  -- Alterações: histórico real do cliente, senão fator manual, senão 1.
  rounds_hist := public.intake_client_rev_rounds(_client_id);
  rounds := coalesce(rounds_hist, c.intake_alteracoes_media, 1);
  rounds := GREATEST(rounds, 0.5);
  revisao_h := n * rev_h * rounds;

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

  total_h  := carga + demanda_h + revisao_h;
  earliest := public.intake_add_business_hours(now(), total_h);
  no_prazo := (_prazo IS NOT NULL) AND (earliest <= _prazo);

  RETURN jsonb_build_object(
    'earliest',      earliest,
    'no_prazo',      no_prazo,
    'carga_horas',   round(carga, 1),
    'demanda_horas', round(demanda_h, 1),
    'revisao_horas', round(revisao_h, 1),
    'total_horas',   round(total_h, 1),
    'sem_editor',    editor IS NULL,
    'complexidade',  complexidade,
    'fator_medio',   fator_med,
    'rodadas',       round(rounds, 2),
    'rodadas_hist',  rounds_hist IS NOT NULL,
    'calib_cliente', calib,
    'calibrado',     calib <> 1
  );
END;
$$;
