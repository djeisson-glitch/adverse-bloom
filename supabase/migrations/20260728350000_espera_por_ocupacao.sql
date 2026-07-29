-- =========================================================================
-- Os prazos saíam LONGOS demais: 8, 13 e 17 dias pra um vídeo de 30s.
--
-- O modelo somava a fila inteira dos 14 dias e fazia o trabalho novo esperar
-- por TODA ela, como se fosse uma fila de banco. Mas essas horas estão
-- espalhadas pelos 14 dias — com 24h comprometidas e 6h úteis por dia, sobram
-- quase 4h livres TODO dia. Um vídeo de 2h não espera 24h de fila; ele entra
-- na folga.
--
-- A conta certa é de OCUPAÇÃO, não de soma:
--   livre por dia = capacidade do dia − (fila ÷ dias úteis da janela)
--   espera        = trabalho ÷ livre por dia
--
-- A capacidade é sempre de UMA pessoa: com editor fixo, a fila já é a dele;
-- sem editor fixo, intake_fila_horas já divide a fila do time pelo número de
-- editores. Nos dois casos `carga` é "por editor".
--
-- Piso de 20% do dia: mesmo um editor afogado entrega alguma coisa — sem o
-- piso, uma fila muito grande faria a espera explodir pro infinito.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.intake_espera_horas(_carga numeric, _trabalho numeric)
RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT GREATEST(_trabalho, 0) / GREATEST(
           public.intake_horas_uteis_dia() - GREATEST(_carga, 0) / 10.0,
           public.intake_horas_uteis_dia() * 0.2
         ) * public.intake_horas_uteis_dia()
$$;

COMMENT ON FUNCTION public.intake_espera_horas(numeric, numeric) IS
  'Horas úteis de espera até o trabalho novo caber na folga do dia. 10 = dias úteis na janela de 14 corridos.';

GRANT EXECUTE ON FUNCTION public.intake_espera_horas(numeric, numeric) TO anon, authenticated;

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

  -- Cascata de níveis 1 → 2 → 3; cai no editor fixo antigo se não houver.
  editor := coalesce(public.intake_editor_do_cliente(c.id, coalesce(c.intake_edit_horas, 4)), c.intake_editor_id);
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

  calib := coalesce(public.intake_client_calib(_client_id, edit_h), 1);
  demanda_h := demanda_h * calib;

  rounds_hist := public.intake_client_rev_rounds(_client_id);
  rounds := coalesce(rounds_hist, c.intake_alteracoes_media, 1);
  rounds := GREATEST(rounds, 0.5);
  revisao_h := n * rev_h * rounds;

  -- A fila NÃO depende mais do prazo pedido: pedir mais tempo não pode fazer
  -- a produtora "ficar mais lenta".
  carga := public.intake_fila_horas(editor, edit_h);

  total_h  := demanda_h + revisao_h;
  -- A espera não é "soma tudo e some depois": a fila dos 14 dias está
  -- ESPALHADA por eles. O que atrasa o trabalho novo é o quanto do dia já
  -- está comprometido, não o total do período.
  earliest := public.intake_add_business_hours(now(), public.intake_espera_horas(carga, total_h));
  no_prazo := (_prazo IS NOT NULL) AND (earliest <= _prazo);

  RETURN jsonb_build_object(
    'earliest',      earliest,
    'no_prazo',      no_prazo,
    'carga_horas',   round(carga, 1),
    'demanda_horas', round(demanda_h, 1),
    'revisao_horas', round(revisao_h, 1),
    'total_horas',   round(total_h, 1),
    'horas_dia',     public.intake_horas_uteis_dia(),
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


GRANT EXECUTE ON FUNCTION public.intake_calc(uuid, jsonb, timestamptz) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.intake_sugestoes(_slug text, _entregas jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c            record;
  editor       uuid;
  edit_h       numeric;
  rev_h        numeric;
  n            int := 1;
  demanda_h    numeric := 0;
  rounds_hist  numeric;
  rounds       numeric;
  revisao_h    numeric;
  backlog      numeric;
  base_h       numeric;
  ent          jsonb;
  niveis       jsonb;
  nv           jsonb;
  bruto        timestamptz;
  ts           timestamptz;
  loc          timestamp;
  prev         timestamptz;
  guarda       int;
  slots        jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO c FROM public.clients WHERE intake_slug = _slug AND intake_ativo LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Cascata de níveis 1 → 2 → 3; cai no editor fixo antigo se não houver.
  editor := coalesce(public.intake_editor_do_cliente(c.id, coalesce(c.intake_edit_horas, 4)), c.intake_editor_id);
  edit_h := coalesce(c.intake_edit_horas, 4);
  rev_h  := coalesce(c.intake_revisao_horas, 2);

  IF jsonb_typeof(_entregas) = 'array' AND jsonb_array_length(_entregas) > 0 THEN
    n := jsonb_array_length(_entregas);
    FOR ent IN SELECT value FROM jsonb_array_elements(_entregas) LOOP
      demanda_h := demanda_h + edit_h * public.intake_entrega_fator(ent);
    END LOOP;
  ELSE
    n := 1;
    demanda_h := edit_h;
  END IF;

  rounds_hist := public.intake_client_rev_rounds(c.id);
  rounds := GREATEST(coalesce(rounds_hist, c.intake_alteracoes_media, 1), 0.5);
  revisao_h := n * rev_h * rounds;

  backlog := public.intake_fila_horas(editor, edit_h);
  base_h  := public.intake_espera_horas(backlog, demanda_h + revisao_h);

  niveis := jsonb_build_array(
    jsonb_build_object('nivel','apertado',   'mult',1.0, 'label','No aperto',   'hint','topo da fila, sem folga',        'recomendado',false),
    jsonb_build_object('nivel','recomendado','mult',1.6, 'label','Recomendado', 'hint','margem pra caprichar e revisar',  'recomendado',true),
    jsonb_build_object('nivel','folgado',    'mult',2.4, 'label','Com folga',   'hint','tranquilo, sobra pra alterações', 'recomendado',false)
  );

  FOR nv IN SELECT value FROM jsonb_array_elements(niveis) LOOP
    bruto := public.intake_add_business_hours(now(), base_h * (nv->>'mult')::numeric);
    loc   := date_trunc('day', timezone('America/Sao_Paulo', bruto)) + interval '18 hours';
    ts    := timezone('America/Sao_Paulo', loc);

    -- Empurra o dia até o slot ser: possível (com folga pra corrida do relógio),
    -- em dia útil, e depois do slot anterior. Um laço só, as três regras juntas
    -- — antes o desvio de fim de semana só valia pro caso de colisão.
    guarda := 0;
    WHILE guarda < 60 AND (
            ts < bruto + interval '30 minutes'
         OR extract(dow FROM loc) IN (0, 6)
         OR (prev IS NOT NULL AND ts <= prev)
          ) LOOP
      loc := loc + interval '1 day';
      ts  := timezone('America/Sao_Paulo', loc);
      guarda := guarda + 1;
    END LOOP;

    prev := ts;
    slots := slots || jsonb_build_array(jsonb_build_object(
      'data',        ts,
      'nivel',       nv->>'nivel',
      'label',       nv->>'label',
      'hint',        nv->>'hint',
      'recomendado', (nv->>'recomendado')::boolean
    ));
  END LOOP;

  RETURN jsonb_build_object('slots', slots, 'sem_editor', editor IS NULL);
END;
$$;
