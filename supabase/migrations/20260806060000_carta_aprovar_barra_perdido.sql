-- =========================================================================
-- Não dá pra aceitar o que já foi recusado
--
-- A migration anterior fechou a LEITURA da carta quando o negócio é perdido,
-- e o próprio DO block dela avisou o que faltava:
--
--   WARNING: carta_aprovar NÃO barra negócio perdido
--
-- O botão "Aprovar" continuava valendo pra quem tivesse a página aberta de
-- antes — e a função termina com `UPDATE deals SET stage = 'aceite'`. Ou
-- seja: um clique numa aba esquecida ressuscitava um negócio que a equipe
-- deu por perdido, sem ninguém saber. Pior que ver a proposta.
--
-- Reconstruída A PARTIR da definição vigente (20260713170000): só entra a
-- guarda; o resto do corpo é idêntico.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.carta_aprovar(
  _token uuid, _nome text, _email text, _celular text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
  st text;
BEGIN
  SELECT * INTO b FROM public.budgets WHERE public_token = _token LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada';
  END IF;

  -- Recusado é recusado. Reabrir é decisão da equipe, pelo funil — não de um
  -- clique numa aba antiga.
  SELECT stage INTO st FROM public.deals WHERE id = b.deal_id;
  IF st = 'perdido' THEN
    RAISE EXCEPTION 'Esta proposta foi encerrada e não pode mais ser aprovada.';
  END IF;

  IF b.aprovada_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'ja_aprovada', true);
  END IF;
  IF coalesce(btrim(_nome), '') = '' OR coalesce(btrim(_email), '') = '' THEN
    RAISE EXCEPTION 'Informe nome e e-mail';
  END IF;

  UPDATE public.budgets
     SET aprovada_em  = now(),
         aprovada_por = jsonb_build_object('nome', _nome, 'email', _email, 'celular', _celular),
         aprovacoes   = coalesce(aprovacoes, '[]'::jsonb)
                        || jsonb_build_object('tipo','aprovacao','nome',_nome,'email',_email,'celular',_celular,'em',now())
   WHERE id = b.id;

  UPDATE public.deals SET stage = 'aceite' WHERE id = b.deal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.carta_aprovar(uuid, text, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------- medição
DO $$
DECLARE fonte text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fonte FROM pg_proc
   WHERE proname = 'carta_aprovar' AND pronamespace = 'public'::regnamespace LIMIT 1;
  IF fonte ILIKE '%perdido%' THEN
    RAISE NOTICE 'ok: carta_aprovar agora barra negócio perdido';
  ELSE
    RAISE EXCEPTION 'a guarda não entrou em carta_aprovar';
  END IF;
END $$;
