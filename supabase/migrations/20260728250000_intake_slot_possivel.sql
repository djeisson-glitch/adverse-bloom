-- =========================================================================
-- O formulário do cliente sugeria um prazo e depois recusava o próprio prazo.
--
-- As duas funções calculam a mesma coisa: base_h em intake_sugestoes é
-- idêntico a total_h * fator em intake_disponibilidade. O problema é o que
-- vem DEPOIS na sugestão: o slot é arredondado pras 18:00 DO MESMO DIA.
--
--   earliest real = 29/07 19:00  →  slot oferecido = 29/07 18:00
--   validação: earliest <= prazo  →  19:00 <= 18:00  →  FALSO
--
-- Ou seja, o arredondamento andava pra TRÁS e criava um horário impossível.
-- Acontece sempre que a conta cai depois das 18:00 — o caso comum, porque a
-- fila empurra pro fim do dia.
--
-- Segunda causa, independente: as duas chamadas acontecem em instantes
-- diferentes (a pessoa escolhe o slot e só então a disponibilidade roda de
-- novo). now() anda, earliest anda junto, e o slot "no aperto" — que é
-- exatamente o earliest — vira passado por alguns minutos. Por isso o slot
-- agora exige uma folga mínima de 30 min sobre o earliest: irrisório num
-- prazo de dias, e mata a corrida.
--
-- De quebra: o desvio de fim de semana só rodava quando o slot colidia com o
-- anterior, então o PRIMEIRO slot podia cair num sábado.
-- =========================================================================

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

  editor := c.intake_editor_id;
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
  base_h  := (backlog + demanda_h + revisao_h) * public.intake_fator_relogio();

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
