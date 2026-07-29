-- =========================================================================
-- Importar as horas do ClickUp do mês da virada.
--
-- Regra combinada com o Djêisson: o ClickUp foi desativado e o OS entrou no
-- lugar imediatamente. As horas dos dois lados são trabalho DIFERENTE, não
-- marcação dupla — então tudo entra e tudo soma. Nada de corte por data.
--
-- A única duplicação possível é reimportar o mesmo lançamento. Contra isso,
-- o id do ClickUp vira chave única: rodar de novo não repete NADA, por
-- construção — não depende de a lógica estar certa.
--
-- E tudo carimbado com um run_id, pra desfazer com um comando se der ruim.
-- =========================================================================

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS clickup_time_entry_id text,
  ADD COLUMN IF NOT EXISTS import_run_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_clickup_uniq
  ON public.time_entries (clickup_time_entry_id)
  WHERE clickup_time_entry_id IS NOT NULL;

COMMENT ON COLUMN public.time_entries.clickup_time_entry_id IS
  'Id do lançamento no ClickUp. Único: reimportar não duplica.';

ALTER TABLE public.deliverable_alteracoes
  ADD COLUMN IF NOT EXISTS clickup_task_id text;

CREATE UNIQUE INDEX IF NOT EXISTS alteracoes_clickup_uniq
  ON public.deliverable_alteracoes (clickup_task_id)
  WHERE clickup_task_id IS NOT NULL;

/**
 * Importa (ou só simula) um lote de horas do ClickUp.
 *
 * Cada item de _entries:
 *   { id, task_id, parent_task_id, task_name, email, start, minutos,
 *     billable, description }
 *
 * Como resolve a peça:
 *   1. task_id casa com deliverables.clickup_task_id  → hora de edição;
 *   2. senão, parent_task_id casa                     → hora de ALTERAÇÃO
 *      (a alteração é criada uma vez, com o id do ClickUp como chave);
 *   3. senão                                          → não entra, vai pro
 *      relatório. Sem palpite: hora que não sabe onde cai não é lançada.
 *
 * _dry_run = true devolve o mesmo relatório sem gravar nada.
 */
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
  prox_num     int;
  n_edicao     int := 0;
  n_alteracao  int := 0;
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
    -- já veio nessa ou noutra rodada?
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

    alt_id := NULL;

    SELECT d.id, d.project_id INTO did, pid
      FROM public.deliverables d WHERE d.clickup_task_id = e->>'task_id';

    IF did IS NULL AND coalesce(e->>'parent_task_id', '') <> '' THEN
      SELECT d.id, d.project_id INTO did, pid
        FROM public.deliverables d WHERE d.clickup_task_id = e->>'parent_task_id';

      IF did IS NOT NULL THEN
        SELECT a.id INTO alt_id FROM public.deliverable_alteracoes a
          WHERE a.clickup_task_id = e->>'task_id';

        IF alt_id IS NULL AND NOT _dry_run THEN
          SELECT COALESCE(MAX(numero), 0) + 1 INTO prox_num
            FROM public.deliverable_alteracoes WHERE deliverable_id = did;
          INSERT INTO public.deliverable_alteracoes
            (deliverable_id, numero, titulo, origem, status, criado_por,
             clickup_task_id, resolved_at)
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

    IF alt_id IS NOT NULL THEN
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
    'simulacao',       _dry_run,
    'edicao',          jsonb_build_object('lancamentos', n_edicao,    'horas', round(min_edicao/60.0, 1)),
    'alteracao',       jsonb_build_object('lancamentos', n_alteracao, 'horas', round(min_alter/60.0, 1)),
    'ja_importados',   n_repetido,
    'sem_peca',        sem_peca,
    'sem_pessoa',      sem_pessoa
  );
END $$;

GRANT EXECUTE ON FUNCTION public.importar_horas_clickup(jsonb, uuid, boolean) TO authenticated;

/** Desfaz uma rodada inteira. */
CREATE OR REPLACE FUNCTION public.reverter_import_horas(_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('erro', 'só admin');
  END IF;
  DELETE FROM public.time_entries WHERE import_run_id = _run_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.deliverable_alteracoes
   WHERE clickup_task_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.time_entries t WHERE t.alteracao_id = deliverable_alteracoes.id);
  RETURN jsonb_build_object('lancamentos_removidos', n);
END $$;

GRANT EXECUTE ON FUNCTION public.reverter_import_horas(uuid) TO authenticated;
