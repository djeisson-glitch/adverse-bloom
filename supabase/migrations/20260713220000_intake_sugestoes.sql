-- =========================================================================
-- Sugestão de horários (nudge de prazo)
--  Em vez de só o campo livre, o formulário oferece 3 opções prontas e
--  destaca a "Recomendada" — a que dá margem pra caprichar/revisar (e mais
--  fôlego pra nós). Arquitetura de escolha honesta: a recomendada é de fato
--  melhor pra qualidade, e o cliente ainda pode escolher outra data.
--
--  Os 3 níveis saem do mesmo motor de horas úteis, com multiplicadores sobre
--  a base (edição por complexidade + revisão por histórico + backlog do editor):
--    • No aperto   (1.0×) — topo da fila, sem folga
--    • Recomendado (1.6×) — margem pra revisar
--    • Com folga   (2.4×) — sobra pra alterações
--  Cada slot é "arredondado" pro fim do expediente (18h America/Sao_Paulo).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.intake_sugestoes(_slug text, _entregas jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c            record;
  editor       uuid;
  edit_h       numeric;
  rev_h        numeric;
  n            int;
  demanda_h    numeric := 0;
  ent          jsonb;
  rounds_hist  numeric;
  rounds       numeric;
  revisao_h    numeric;
  backlog      numeric := 0;
  cnt          int;
  th           numeric;
  base_h       numeric;
  niveis       jsonb;
  nv           jsonb;
  ts           timestamptz;
  loc          timestamp;
  prev         timestamptz := NULL;
  slots        jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO c FROM public.clients WHERE intake_slug = _slug AND intake_ativo LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  editor := c.intake_editor_id;
  edit_h := coalesce(c.intake_edit_horas, 4);
  rev_h  := coalesce(c.intake_revisao_horas, 2);

  -- Edição por complexidade (duração).
  IF jsonb_typeof(_entregas) = 'array' AND jsonb_array_length(_entregas) > 0 THEN
    n := jsonb_array_length(_entregas);
    FOR ent IN SELECT value FROM jsonb_array_elements(_entregas) LOOP
      demanda_h := demanda_h + edit_h * public.intake_entrega_fator(ent);
    END LOOP;
  ELSE
    n := 1;
    demanda_h := edit_h;
  END IF;

  -- Alterações por histórico do cliente (fallback manual).
  rounds_hist := public.intake_client_rev_rounds(c.id);
  rounds := GREATEST(coalesce(rounds_hist, c.intake_alteracoes_media, 1), 0.5);
  revisao_h := n * rev_h * rounds;

  -- Backlog atual do editor (independente de data).
  IF editor IS NOT NULL THEN
    SELECT count(*) INTO cnt
      FROM public.deliverables d
     WHERE d.responsavel_id = editor
       AND coalesce(d.status, '') NOT IN ('aprovado','entregue','concluido','cancelado','arquivado');
    backlog := backlog + coalesce(cnt, 0) * edit_h;

    SELECT coalesce(sum(estimativa_horas), 0) INTO th
      FROM public.tasks
     WHERE assigned_user_id = editor
       AND coalesce(completed, false) = false
       AND coalesce(status, '') NOT IN ('done','concluido','completed','cancelado');
    backlog := backlog + coalesce(th, 0);
  END IF;

  base_h := backlog + demanda_h + revisao_h;

  niveis := jsonb_build_array(
    jsonb_build_object('nivel','apertado',   'mult',1.0, 'label','No aperto',   'hint','topo da fila, sem folga',        'recomendado',false),
    jsonb_build_object('nivel','recomendado','mult',1.6, 'label','Recomendado', 'hint','margem pra caprichar e revisar',  'recomendado',true),
    jsonb_build_object('nivel','folgado',    'mult',2.4, 'label','Com folga',   'hint','tranquilo, sobra pra alterações', 'recomendado',false)
  );

  FOR nv IN SELECT value FROM jsonb_array_elements(niveis) LOOP
    ts  := public.intake_add_business_hours(now(), base_h * (nv->>'mult')::numeric);
    loc := date_trunc('day', timezone('America/Sao_Paulo', ts)) + interval '18 hours';   -- fim do expediente
    ts  := timezone('America/Sao_Paulo', loc);
    -- cada slot precisa cair depois do anterior (não repetir o mesmo dia)
    IF prev IS NOT NULL AND ts <= prev THEN
      loc := date_trunc('day', timezone('America/Sao_Paulo', prev)) + interval '1 day' + interval '18 hours';
      WHILE extract(dow FROM loc) IN (0, 6) LOOP loc := loc + interval '1 day'; END LOOP;
      ts := timezone('America/Sao_Paulo', loc);
    END IF;
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

GRANT EXECUTE ON FUNCTION public.intake_sugestoes(text, jsonb) TO anon, authenticated;
