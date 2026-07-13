-- =========================================================================
-- Viabilidade de prazo COM complexidade + histórico
--  Antes: horas = nº de entregas × valor fixo; buffer de revisão fixo.
--  Agora:
--   • horas de edição escalam pela DURAÇÃO de cada vídeo (reels 45" ≠ filme 3min);
--   • o buffer de alteração usa o Nº MÉDIO DE RODADAS real do cliente
--     (tabela deliverable_alteracoes) — Sul Minas com muito histórico de
--     alteração já projeta mais folga. Sem histórico suficiente, cai num
--     fator manual por cliente (intake_alteracoes_media).
--  A leitura de IA (complexidade a partir do briefing) fica na função
--  intake-ia, gravada em demandas.ia_complexidade — não entra no cálculo ao vivo.
-- =========================================================================

-- ---- Novas colunas -------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS intake_alteracoes_media numeric NOT NULL DEFAULT 1; -- rodadas médias de alteração (fallback do histórico)

ALTER TABLE public.demandas
  ADD COLUMN IF NOT EXISTS ia_complexidade jsonb;                              -- leitura de complexidade da IA

-- ---- Duração em segundos (parse tolerante) ------------------------------
--  Aceita "45s", "45", "3min", "1m30", "1:30", "1'30", "1,5min"…
CREATE OR REPLACE FUNCTION public.intake_dur_segundos(_txt text)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s text; m text[];
BEGIN
  s := lower(coalesce(_txt, ''));
  IF btrim(s) = '' THEN RETURN NULL; END IF;
  -- mm:ss ou mm'ss  (ex.: 1:30, 1'30)
  m := regexp_match(s, '(\d+)\s*[:'']\s*(\d{1,2})');
  IF m IS NOT NULL THEN
    RETURN (m[1])::numeric * 60 + (m[2])::numeric;
  END IF;
  -- Xmin / Xm (minutos) — casa o 'm' de "min"/"m"
  m := regexp_match(s, '(\d+([.,]\d+)?)\s*m');
  IF m IS NOT NULL THEN
    RETURN replace(m[1], ',', '.')::numeric * 60;
  END IF;
  -- número puro => segundos
  m := regexp_match(s, '(\d+([.,]\d+)?)');
  IF m IS NOT NULL THEN
    RETURN replace(m[1], ',', '.')::numeric;
  END IF;
  RETURN NULL;
END;
$$;

-- ---- Fator de complexidade por entrega (a partir da duração) ------------
CREATE OR REPLACE FUNCTION public.intake_entrega_fator(_entrega jsonb)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE sec numeric;
BEGIN
  sec := public.intake_dur_segundos(_entrega->>'duracao');
  IF sec IS NULL THEN RETURN 1.0; END IF;   -- sem duração: assume padrão
  IF sec <= 20  THEN RETURN 0.6; END IF;
  IF sec <= 40  THEN RETURN 0.8; END IF;
  IF sec <= 75  THEN RETURN 1.0; END IF;
  IF sec <= 180 THEN RETURN 1.8; END IF;
  IF sec <= 420 THEN RETURN 3.0; END IF;
  RETURN 4.5;
END;
$$;

-- ---- Rodadas médias de alteração do cliente (histórico) -----------------
--  NULL quando há pouco histórico (< 3 entregáveis) — aí o caller usa o manual.
CREATE OR REPLACE FUNCTION public.intake_client_rev_rounds(_client_id uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE AS $$
DECLARE ndel int; nalt int;
BEGIN
  IF _client_id IS NULL THEN RETURN NULL; END IF;
  SELECT count(DISTINCT d.id) INTO ndel
    FROM public.deliverables d
    JOIN public.projects p ON p.id = d.project_id
   WHERE p.client_id = _client_id
     AND coalesce(d.tipo, 'entregavel') = 'entregavel';
  IF coalesce(ndel, 0) < 3 THEN RETURN NULL; END IF;
  SELECT count(*) INTO nalt
    FROM public.deliverable_alteracoes a
    JOIN public.deliverables d ON d.id = a.deliverable_id
    JOIN public.projects p ON p.id = d.project_id
   WHERE p.client_id = _client_id;
  RETURN round(coalesce(nalt, 0)::numeric / ndel, 2);
END;
$$;

-- ---- Recria intake_calc / intake_disponibilidade recebendo as ENTREGAS ---
DROP FUNCTION IF EXISTS public.intake_calc(uuid, int, timestamptz);
DROP FUNCTION IF EXISTS public.intake_disponibilidade(text, int, timestamptz);

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
BEGIN
  SELECT * INTO c FROM public.clients WHERE id = _client_id LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  editor := c.intake_editor_id;
  edit_h := coalesce(c.intake_edit_horas, 4);
  rev_h  := coalesce(c.intake_revisao_horas, 2);

  -- Edição: soma por complexidade (duração). Sem entregas => 1 padrão.
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

  -- Alterações: histórico real do cliente, senão fator manual, senão 1.
  rounds_hist := public.intake_client_rev_rounds(_client_id);
  rounds := coalesce(rounds_hist, c.intake_alteracoes_media, 1);
  rounds := GREATEST(rounds, 0.5);          -- sempre um mínimo de folga
  revisao_h := n * rev_h * rounds;

  -- Carga: fila do editor até o prazo.
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
    'rodadas_hist',  rounds_hist IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.intake_disponibilidade(_slug text, _entregas jsonb, _prazo timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  SELECT id INTO cid FROM public.clients WHERE intake_slug = _slug AND intake_ativo LIMIT 1;
  IF cid IS NULL THEN RETURN NULL; END IF;
  RETURN public.intake_calc(cid, _entregas, _prazo);
END;
$$;

-- intake_submit agora passa as entregas completas pro cálculo.
CREATE OR REPLACE FUNCTION public.intake_submit(
  _slug text, _nome text, _email text, _projeto text,
  _entregas jsonb, _prazo timestamptz, _anexos jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c        record;
  nova_id  uuid;
  viab     jsonb;
BEGIN
  SELECT * INTO c FROM public.clients WHERE intake_slug = _slug LIMIT 1;
  IF NOT FOUND OR NOT c.intake_ativo THEN
    RAISE EXCEPTION 'Formulário não encontrado';
  END IF;
  IF coalesce(btrim(_nome), '') = '' OR coalesce(btrim(_email), '') = ''
     OR coalesce(btrim(_projeto), '') = '' THEN
    RAISE EXCEPTION 'Preencha nome, e-mail e nome do projeto';
  END IF;

  viab := public.intake_calc(c.id, coalesce(_entregas, '[]'::jsonb), _prazo);

  INSERT INTO public.demandas
    (client_id, solicitante_nome, solicitante_email, nome_projeto, entregas, prazo_desejado, anexos, viabilidade)
  VALUES
    (c.id, _nome, _email, _projeto,
     coalesce(_entregas, '[]'::jsonb), _prazo, coalesce(_anexos, '[]'::jsonb), viab)
  RETURNING id INTO nova_id;

  RETURN jsonb_build_object('ok', true, 'demanda_id', nova_id) || coalesce(viab, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.intake_calc(uuid, jsonb, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_disponibilidade(text, jsonb, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_submit(text, text, text, text, jsonb, timestamptz, jsonb) TO anon, authenticated;
