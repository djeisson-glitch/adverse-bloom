-- Hora apontada na tarefa do PROJETO, não na peça.
--
-- Acontece na prática (2 casos em julho: 3h50). O importador mandava pra lista
-- de "não casou", o que é correto quando há dúvida — mas quando o projeto tem
-- UMA peça só, dúvida não existe: a hora é daquela peça.
--
-- A regra só age no caso inequívoco. Projeto com duas ou mais peças continua
-- indo pra decisão humana — é onde um palpite viraria hora no lugar errado,
-- e hora no lugar errado vira fatura errada.
CREATE OR REPLACE FUNCTION public.importar_horas_clickup(
  _entries jsonb, _run_id uuid, _dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e            jsonb;
  did          uuid;
  pid          uuid;
  uid          uuid;
  alt_id       uuid;
  eh_alteracao boolean;
  n_pecas      int;
  prox_num     int;
  n_edicao     int := 0;
  n_alteracao  int := 0;
  n_projeto    int := 0;
  n_repetido   int := 0;
  min_edicao   int := 0;
  min_alter    int := 0;
  sem_peca     jsonb := '[]'::jsonb;
  sem_pessoa   jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('erro', 'só admin importa horas');
  END IF;

  FOR e IN SELECT value FROM jsonb_array_elements(_entries) LOOP
    IF EXISTS (SELECT 1 FROM public.time_entries t
                WHERE t.clickup_time_entry_id = e->>'id') THEN
      n_repetido := n_repetido + 1;
      CONTINUE;
    END IF;

    SELECT id INTO uid FROM public.profiles WHERE lower(email) = lower(e->>'email');
    IF uid IS NULL THEN
      sem_pessoa := sem_pessoa || jsonb_build_array(e->>'email');
      CONTINUE;
    END IF;

    alt_id := NULL; eh_alteracao := false; did := NULL; pid := NULL;

    SELECT d.id, d.project_id INTO did, pid
      FROM public.deliverables d WHERE d.clickup_task_id = e->>'task_id';

    -- 2º: é a tarefa do PROJETO? Com uma peça só, a hora é dela.
    IF did IS NULL THEN
      SELECT p.id INTO pid FROM public.projects p WHERE p.clickup_task_id = e->>'task_id';
      IF pid IS NOT NULL THEN
        SELECT count(*) INTO n_pecas FROM public.deliverables d WHERE d.project_id = pid;
        IF n_pecas = 1 THEN
          SELECT d.id INTO did FROM public.deliverables d WHERE d.project_id = pid;
          n_projeto := n_projeto + 1;
        ELSE
          pid := NULL;   -- ambíguo: não adivinha
        END IF;
      END IF;
    END IF;

    -- 3º: é uma alteração? o pai é que diz a peça.
    IF did IS NULL AND coalesce(e->>'parent_task_id', '') <> '' THEN
      SELECT d.id, d.project_id INTO did, pid
        FROM public.deliverables d WHERE d.clickup_task_id = e->>'parent_task_id';
      IF did IS NOT NULL THEN
        eh_alteracao := true;
        SELECT a.id INTO alt_id FROM public.deliverable_alteracoes a
          WHERE a.clickup_task_id = e->>'task_id';
        IF alt_id IS NULL AND NOT _dry_run THEN
          SELECT COALESCE(MAX(numero), 0) + 1 INTO prox_num
            FROM public.deliverable_alteracoes WHERE deliverable_id = did;
          INSERT INTO public.deliverable_alteracoes
            (deliverable_id, numero, titulo, origem, status, criado_por, clickup_task_id, resolved_at)
          VALUES (did, prox_num, coalesce(nullif(e->>'task_name',''), 'Alteração importada'),
                  'cliente', 'resolvida', 'ClickUp', e->>'task_id', now())
          RETURNING id INTO alt_id;
        END IF;
      END IF;
    END IF;

    IF did IS NULL THEN
      sem_peca := sem_peca || jsonb_build_array(jsonb_build_object(
        'task_id', e->>'task_id', 'nome', e->>'task_name', 'minutos', (e->>'minutos')::int));
      CONTINUE;
    END IF;

    IF eh_alteracao THEN
      n_alteracao := n_alteracao + 1; min_alter := min_alter + (e->>'minutos')::int;
    ELSE
      n_edicao := n_edicao + 1;      min_edicao := min_edicao + (e->>'minutos')::int;
    END IF;

    IF NOT _dry_run THEN
      INSERT INTO public.time_entries
        (user_id, project_id, deliverable_id, alteracao_id, start_at, duration_min,
         description, billable, source, clickup_time_entry_id, import_run_id)
      VALUES (uid, pid, did, alt_id, (e->>'start')::timestamptz, (e->>'minutos')::int,
              nullif(e->>'description',''), coalesce((e->>'billable')::boolean, true),
              'clickup', e->>'id', _run_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'simulacao',        _dry_run,
    'edicao',           jsonb_build_object('lancamentos', n_edicao,    'horas', round(min_edicao/60.0, 1)),
    'alteracao',        jsonb_build_object('lancamentos', n_alteracao, 'horas', round(min_alter/60.0, 1)),
    'vieram_do_projeto', n_projeto,
    'ja_importados',    n_repetido,
    'sem_peca',         sem_peca,
    'sem_pessoa',       sem_pessoa
  );
END $$;

GRANT EXECUTE ON FUNCTION public.importar_horas_clickup(jsonb, uuid, boolean) TO authenticated;
