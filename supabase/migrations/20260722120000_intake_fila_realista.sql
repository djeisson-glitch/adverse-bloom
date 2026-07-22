-- =========================================================================
-- Prazo do intake: fila única, dia real de 6h e reserva de alteração honesta
--
--  Três problemas mapeados olhando os números reais do Sicredi Sul Minas
--  (22/07/2026, vídeo de 60s: 3,5h de edição — e 31,5h de fila):
--
--  1) FILA SEM TETO E SEM DATA. intake_sugestoes contava TODO entregável
--     aberto do editor, sem filtro de data — inclusive item parado sem data e
--     item com entrega em setembro. Um terço da fila do Sicredi eram 3 Reels
--     sem data nenhuma. Item não agendado não está na frente de ninguém.
--
--  2) AS DUAS TELAS USAVAM FILAS DIFERENTES. Os 3 slots sugeridos usavam a
--     fila inteira; a data custom (intake_calc) só o que vencia até a data
--     pedida. Resultado visível pro cliente: o sistema prometia 27/07 numa
--     tela e 28/07 na outra. Pior, o filtro por _prazo criava um laço perverso
--     — quanto MAIS longe você pedia, mais itens entravam na conta e mais
--     tarde ficava o "mais próximo". Agora as duas chamam intake_fila_horas,
--     com horizonte fixo: pedir mais prazo não deixa a produtora mais lenta.
--
--  3) DIA DE 9h DE EDIÇÃO PURA. A conta assumia a jornada inteira editando.
--     Ninguém edita 9h por dia — tem reunião, gravação, revisão, retorno de
--     cliente. Passa a valer 6h úteis por dia (decisão do Djeisson): a hora de
--     trabalho ocupa 1,5h de relógio.
--
--  E o efeito colateral da importação do ClickUp: intake_client_rev_rounds
--  dividia alterações registradas por TODOS os entregáveis do cliente. Com
--  ~185 entregáveis importados que nunca tiveram alteração registrada aqui, a
--  taxa aprendida virou 0,01 e sobrepunha o intake_alteracoes_media = 3
--  configurado na mão. Reserva de alteração caiu pra 1h onde deveriam ser 6h.
-- =========================================================================

-- ---- Quanto de EDIÇÃO PURA cabe num dia --------------------------------
-- Mudar aqui muda todo o cálculo de prazo. Jornada de relógio segue 09–18.
CREATE OR REPLACE FUNCTION public.intake_horas_uteis_dia()
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT 6.0::numeric $$;

-- Quanto de RELÓGIO uma hora de trabalho ocupa (9h de jornada / 6h úteis).
CREATE OR REPLACE FUNCTION public.intake_fator_relogio()
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT 9.0 / GREATEST(public.intake_horas_uteis_dia(), 0.5)
$$;

-- ---- A fila do editor: UMA regra, usada pelas duas telas ----------------
--  • com data dentro do horizonte (14 dias): conta inteiro;
--  • sem data: só o que está COM O CLIENTE, a 60% — vai voltar como ajuste,
--    mas não é edição do zero. Sem data e parado ("pendente", "na fila") não
--    entra: não está agendado, não pode empurrar o prazo de quem está pedindo;
--  • tarefas com prazo no horizonte entram pela estimativa.
CREATE OR REPLACE FUNCTION public.intake_fila_horas(_editor uuid, _edit_h numeric)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ate    date := (now() AT TIME ZONE 'America/Sao_Paulo')::date + 14;
  eh     numeric := GREATEST(coalesce(_edit_h, 4), 0);
  h      numeric := 0;
  n_data int;
  n_cli  int;
  th     numeric;
BEGIN
  IF _editor IS NULL THEN RETURN 0; END IF;

  SELECT count(*) INTO n_data
    FROM public.deliverables d
   WHERE d.responsavel_id = _editor
     AND coalesce(d.status, '') NOT IN ('aprovado','entregue','concluido','cancelado','arquivado')
     AND d.data_entrega IS NOT NULL
     AND d.data_entrega <= ate;
  h := h + coalesce(n_data, 0) * eh;

  SELECT count(*) INTO n_cli
    FROM public.deliverables d
   WHERE d.responsavel_id = _editor
     AND d.data_entrega IS NULL
     AND coalesce(d.status, '') = 'com_cliente';
  h := h + coalesce(n_cli, 0) * eh * 0.6;

  SELECT coalesce(sum(estimativa_horas), 0) INTO th
    FROM public.tasks
   WHERE assigned_user_id = _editor
     AND coalesce(completed, false) = false
     AND coalesce(status, '') NOT IN ('done','concluido','completed','cancelado')
     AND due_date IS NOT NULL
     AND due_date <= ate;
  h := h + coalesce(th, 0);

  RETURN h;
END;
$$;
GRANT EXECUTE ON FUNCTION public.intake_fila_horas(uuid, numeric) TO anon, authenticated;

-- ---- Rodadas de alteração: só aprende com evidência de verdade ----------
-- Ignora entregáveis que vieram de importação (o projeto nasceu num run) e só
-- confia na taxa aprendida com amostra dos dois lados. Sem isso, vale o
-- intake_alteracoes_media configurado na ficha do cliente.
CREATE OR REPLACE FUNCTION public.intake_client_rev_rounds(_client_id uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ndel int; nalt int;
BEGIN
  IF _client_id IS NULL THEN RETURN NULL; END IF;

  WITH importados AS (
    SELECT (jsonb_array_elements_text(coalesce(payload->'project_ids', '[]'::jsonb)))::uuid AS pid
      FROM public.import_runs
     WHERE revertido_em IS NULL
  ),
  nativos AS (
    SELECT d.id
      FROM public.deliverables d
      JOIN public.projects p ON p.id = d.project_id
     WHERE p.client_id = _client_id
       AND coalesce(d.tipo, 'entregavel') = 'entregavel'
       AND p.id NOT IN (SELECT pid FROM importados)
  )
  SELECT count(*) INTO ndel FROM nativos;

  IF coalesce(ndel, 0) < 3 THEN RETURN NULL; END IF;

  WITH importados AS (
    SELECT (jsonb_array_elements_text(coalesce(payload->'project_ids', '[]'::jsonb)))::uuid AS pid
      FROM public.import_runs
     WHERE revertido_em IS NULL
  )
  SELECT count(*) INTO nalt
    FROM public.deliverable_alteracoes a
    JOIN public.deliverables d ON d.id = a.deliverable_id
    JOIN public.projects p ON p.id = d.project_id
   WHERE p.client_id = _client_id
     AND p.id NOT IN (SELECT pid FROM importados);

  -- Pouca alteração registrada não é "cliente que não pede alteração", é
  -- sistema que ainda não viu o suficiente. Cai no valor configurado.
  IF coalesce(nalt, 0) < 3 THEN RETURN NULL; END IF;

  RETURN round(nalt::numeric / ndel, 2);
END;
$$;
GRANT EXECUTE ON FUNCTION public.intake_client_rev_rounds(uuid) TO anon, authenticated;

-- ---- intake_calc: fila única + relógio real -----------------------------
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

  calib := coalesce(public.intake_client_calib(_client_id, edit_h), 1);
  demanda_h := demanda_h * calib;

  rounds_hist := public.intake_client_rev_rounds(_client_id);
  rounds := coalesce(rounds_hist, c.intake_alteracoes_media, 1);
  rounds := GREATEST(rounds, 0.5);
  revisao_h := n * rev_h * rounds;

  -- A fila NÃO depende mais do prazo pedido: pedir mais tempo não pode fazer
  -- a produtora "ficar mais lenta".
  carga := public.intake_fila_horas(editor, edit_h);

  total_h  := carga + demanda_h + revisao_h;
  earliest := public.intake_add_business_hours(now(), total_h * public.intake_fator_relogio());
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

-- ---- intake_sugestoes: mesma fila, mesmo relógio ------------------------
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
    ts  := public.intake_add_business_hours(now(), base_h * (nv->>'mult')::numeric);
    loc := date_trunc('day', timezone('America/Sao_Paulo', ts)) + interval '18 hours';
    ts  := timezone('America/Sao_Paulo', loc);
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
