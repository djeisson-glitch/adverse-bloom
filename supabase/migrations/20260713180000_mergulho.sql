-- =========================================================================
-- Mergulho / Briefing estratégico (Método Adverse)
--  • Mora no deal (nasce no lead, vai até o projeto via projects.deal_id).
--  • deals.mergulho: respostas (jsonb). mergulho_token: link público pro
--    cliente responder (ou pra equipe preencher na reunião). mergulho_em:
--    quando foi respondido/atualizado.
--  • mergulho_publico / mergulho_salvar: endpoints públicos (sem login).
-- =========================================================================

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS mergulho jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS mergulho_token uuid,
  ADD COLUMN IF NOT EXISTS mergulho_em timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS deals_mergulho_token_idx
  ON public.deals (mergulho_token) WHERE mergulho_token IS NOT NULL;

-- Lê o mergulho por token (sem auth) — só o necessário pro formulário.
CREATE OR REPLACE FUNCTION public.mergulho_publico(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record;
BEGIN
  SELECT dd.title, dd.mergulho, c.name AS client_name
    INTO d
    FROM public.deals dd
    LEFT JOIN public.clients c ON c.id = dd.client_id
   WHERE dd.mergulho_token = _token
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'projeto',      d.title,
    'cliente_nome', d.client_name,
    'mergulho',     coalesce(d.mergulho, '{}'::jsonb)
  );
END;
$$;

-- Salva as respostas do mergulho (sem auth) — valida o token.
CREATE OR REPLACE FUNCTION public.mergulho_salvar(_token uuid, _dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE did uuid;
BEGIN
  SELECT id INTO did FROM public.deals WHERE mergulho_token = _token LIMIT 1;
  IF did IS NULL THEN
    RAISE EXCEPTION 'Formulário não encontrado';
  END IF;
  UPDATE public.deals
     SET mergulho = coalesce(_dados, '{}'::jsonb),
         mergulho_em = now()
   WHERE id = did;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mergulho_publico(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mergulho_salvar(uuid, jsonb) TO anon, authenticated;
