-- =========================================================================
-- Formulário de demandas do cliente (intake) + viabilidade de prazo
--  • clients ganham config de intake (slug do link, editor responsável,
--    horas de edição por vídeo, buffer de revisão interna).
--  • demandas: cada envio do formulário público.
--  • bucket de storage "demandas" pros anexos.
--  • intake_submit: valida o slug, calcula "quando conseguimos entregar"
--    (lê a fila do editor daquele cliente, sem expor a agenda), grava a
--    demanda e devolve o veredito. Padrão SECURITY DEFINER + GRANT anon.
-- =========================================================================

-- ---- Config de intake por cliente --------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS intake_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS intake_slug text,
  ADD COLUMN IF NOT EXISTS intake_editor_id uuid,          -- auth.users do editor daquele cliente
  ADD COLUMN IF NOT EXISTS intake_edit_horas numeric NOT NULL DEFAULT 4,   -- horas de edição por vídeo
  ADD COLUMN IF NOT EXISTS intake_revisao_horas numeric NOT NULL DEFAULT 2; -- buffer de revisão interna

CREATE UNIQUE INDEX IF NOT EXISTS clients_intake_slug_idx
  ON public.clients (intake_slug) WHERE intake_slug IS NOT NULL;

-- ---- Demandas (envios do formulário) -----------------------------------
CREATE TABLE IF NOT EXISTS public.demandas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  solicitante_nome text NOT NULL,
  solicitante_email text NOT NULL,
  nome_projeto text NOT NULL,
  entregas jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{titulo, formato, duracao, briefing}]
  prazo_desejado timestamptz,
  anexos jsonb NOT NULL DEFAULT '[]'::jsonb,      -- [{nome, path, url}]
  viabilidade jsonb,                              -- resultado do cálculo de prazo
  status text NOT NULL DEFAULT 'nova',            -- nova | aceita | recusada | virou_projeto
  projeto_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demandas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "demandas all" ON public.demandas;
CREATE POLICY "demandas all" ON public.demandas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---- Bucket de anexos ---------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('demandas', 'demandas', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "demandas anon upload" ON storage.objects;
CREATE POLICY "demandas anon upload" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'demandas');
DROP POLICY IF EXISTS "demandas auth upload" ON storage.objects;
CREATE POLICY "demandas auth upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'demandas');
DROP POLICY IF EXISTS "demandas public read" ON storage.objects;
CREATE POLICY "demandas public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'demandas');

-- ---- Horário comercial: soma N horas úteis a partir de um instante ------
-- Jornada 09h–18h, seg–sex, fuso America/Sao_Paulo. É uma estimativa.
CREATE OR REPLACE FUNCTION public.intake_add_business_hours(_start timestamptz, _hours numeric)
RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $$
DECLARE
  cur       timestamp;             -- naive, em horário local
  remaining numeric := GREATEST(coalesce(_hours, 0), 0);
  ws        int := 9;              -- início da jornada
  we        int := 18;             -- fim da jornada
  day_start timestamp;
  day_end   timestamp;
  avail     numeric;
  guard     int := 0;
BEGIN
  cur := timezone('America/Sao_Paulo', _start);
  LOOP
    guard := guard + 1;
    EXIT WHEN guard > 4000;                        -- trava de segurança
    -- fim de semana → pula pro próximo dia às 09h
    IF extract(dow FROM cur) IN (0, 6) THEN
      cur := date_trunc('day', cur) + interval '1 day' + (ws || ' hours')::interval;
      CONTINUE;
    END IF;
    day_start := date_trunc('day', cur) + (ws || ' hours')::interval;
    day_end   := date_trunc('day', cur) + (we || ' hours')::interval;
    IF cur < day_start THEN
      cur := day_start;
    END IF;
    IF cur >= day_end THEN
      cur := date_trunc('day', cur) + interval '1 day' + (ws || ' hours')::interval;
      CONTINUE;
    END IF;
    EXIT WHEN remaining <= 0;                      -- já normalizado no próximo instante útil
    avail := extract(epoch FROM (day_end - cur)) / 3600.0;
    IF remaining <= avail THEN
      cur := cur + (remaining * interval '1 hour');
      remaining := 0;
      EXIT;
    ELSE
      remaining := remaining - avail;
      cur := day_end;
    END IF;
  END LOOP;
  RETURN timezone('America/Sao_Paulo', cur);
END;
$$;

-- ---- Config pública do formulário (nome do cliente + ativo) -------------
CREATE OR REPLACE FUNCTION public.intake_config(_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  SELECT id, name, intake_ativo INTO c
    FROM public.clients WHERE intake_slug = _slug LIMIT 1;
  IF NOT FOUND OR NOT c.intake_ativo THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('nome', c.name, 'ativo', c.intake_ativo);
END;
$$;

-- ---- Envio da demanda + cálculo de viabilidade -------------------------
CREATE OR REPLACE FUNCTION public.intake_submit(
  _slug text, _nome text, _email text, _projeto text,
  _entregas jsonb, _prazo timestamptz, _anexos jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c            record;
  editor       uuid;
  edit_h       numeric;
  rev_h        numeric;
  n_entregas   int;
  demanda_h    numeric;
  carga        numeric := 0;
  cnt          int;
  th           numeric;
  total_h      numeric;
  earliest     timestamptz;
  no_prazo     boolean;
  nova_id      uuid;
  viab         jsonb;
BEGIN
  SELECT * INTO c FROM public.clients WHERE intake_slug = _slug LIMIT 1;
  IF NOT FOUND OR NOT c.intake_ativo THEN
    RAISE EXCEPTION 'Formulário não encontrado';
  END IF;
  IF coalesce(btrim(_nome), '') = '' OR coalesce(btrim(_email), '') = ''
     OR coalesce(btrim(_projeto), '') = '' THEN
    RAISE EXCEPTION 'Preencha nome, e-mail e nome do projeto';
  END IF;

  editor := c.intake_editor_id;
  edit_h := coalesce(c.intake_edit_horas, 4);
  rev_h  := coalesce(c.intake_revisao_horas, 2);
  n_entregas := CASE WHEN jsonb_typeof(_entregas) = 'array' THEN jsonb_array_length(_entregas) ELSE 0 END;
  IF n_entregas < 1 THEN n_entregas := 1; END IF;
  demanda_h := n_entregas * edit_h;

  -- Fila do editor até o prazo pedido (entregáveis abertos + tarefas estimadas)
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

  INSERT INTO public.demandas
    (client_id, solicitante_nome, solicitante_email, nome_projeto, entregas, prazo_desejado, anexos)
  VALUES
    (c.id, _nome, _email, _projeto,
     coalesce(_entregas, '[]'::jsonb), _prazo, coalesce(_anexos, '[]'::jsonb))
  RETURNING id INTO nova_id;

  viab := jsonb_build_object(
    'earliest',      earliest,
    'no_prazo',      no_prazo,
    'carga_horas',   round(carga, 1),
    'demanda_horas', round(demanda_h, 1),
    'revisao_horas', round(rev_h, 1),
    'total_horas',   round(total_h, 1),
    'sem_editor',    editor IS NULL
  );
  UPDATE public.demandas SET viabilidade = viab WHERE id = nova_id;

  RETURN jsonb_build_object('ok', true, 'demanda_id', nova_id) || viab;
END;
$$;

GRANT EXECUTE ON FUNCTION public.intake_config(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_submit(text, text, text, text, jsonb, timestamptz, jsonb) TO anon, authenticated;
