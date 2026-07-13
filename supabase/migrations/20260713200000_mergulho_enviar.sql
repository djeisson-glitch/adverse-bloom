-- =========================================================================
-- Briefing: enviar (finalizar) + retomar
--  • deals.mergulho_enviado_em: marca quando o cliente clicou em "Enviar".
--    Enquanto null, o cliente pode voltar e continuar de onde parou (o token
--    guarda as respostas salvas).
--  • mergulho_enviar: salva as respostas e marca como enviado.
--  • mergulho_publico devolve enviado_em também.
-- =========================================================================

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS mergulho_enviado_em timestamptz;

CREATE OR REPLACE FUNCTION public.mergulho_enviar(_token uuid, _dados jsonb)
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
         mergulho_em = now(),
         mergulho_enviado_em = now()
   WHERE id = did;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.mergulho_publico(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record;
BEGIN
  SELECT dd.title, dd.mergulho, dd.mergulho_enviado_em, c.name AS client_name
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
    'enviado_em',   d.mergulho_enviado_em,
    'mergulho',     coalesce(d.mergulho, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mergulho_enviar(uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mergulho_publico(uuid) TO anon, authenticated;
