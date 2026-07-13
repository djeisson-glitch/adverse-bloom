-- =========================================================================
-- Carta pública (link pro cliente) + aprovação
--  • budgets ganha public_token (o link do cliente), aprovada_em e aprovada_por.
--  • carta_publica(_token): endpoint SECURITY DEFINER que devolve os dados da
--    carta pra qualquer um com o token (sem login) — só a carta, nada mais.
--  • carta_aprovar(_token, nome, email, celular): registra a aprovação do
--    cliente e move o deal pra "aceite".
-- =========================================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS public_token uuid,
  ADD COLUMN IF NOT EXISTS aprovada_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovada_por jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS budgets_public_token_idx
  ON public.budgets (public_token) WHERE public_token IS NOT NULL;

-- Gera (ou reutiliza) o token público de um orçamento. Só quem está logado
-- (produtora) chama isso; o cliente só usa o token pronto.
CREATE OR REPLACE FUNCTION public.carta_gerar_token(_budget_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tok uuid;
BEGIN
  SELECT public_token INTO tok FROM public.budgets WHERE id = _budget_id;
  IF tok IS NULL THEN
    tok := gen_random_uuid();
    UPDATE public.budgets SET public_token = tok WHERE id = _budget_id;
  END IF;
  RETURN tok;
END;
$$;

-- Dados da carta pública (sem auth) — valida o token e devolve só o necessário.
CREATE OR REPLACE FUNCTION public.carta_publica(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
  d record;
BEGIN
  SELECT * INTO b FROM public.budgets WHERE public_token = _token LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT dd.title, dd.objetivo, dd.tipo_orcamento, dd.stage,
         c.name AS client_name, c.contact_name AS client_contact,
         c.email AS client_email, c.phone AS client_phone
    INTO d
    FROM public.deals dd
    LEFT JOIN public.clients c ON c.id = dd.client_id
   WHERE dd.id = b.deal_id;

  RETURN jsonb_build_object(
    'proposta',     b.proposta,
    'total_value',  b.total_value,
    'aprovada_em',  b.aprovada_em,
    'aprovada_por', b.aprovada_por,
    'deal', jsonb_build_object(
      'title',          d.title,
      'objetivo',       d.objetivo,
      'tipo_orcamento', d.tipo_orcamento
    ),
    'cliente', jsonb_build_object(
      'nome',     d.client_name,
      'contato',  d.client_contact,
      'email',    d.client_email,
      'telefone', d.client_phone
    )
  );
END;
$$;

-- Aprovação do cliente — registra nome/email/celular e marca o deal como aceite.
CREATE OR REPLACE FUNCTION public.carta_aprovar(
  _token uuid, _nome text, _email text, _celular text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
BEGIN
  SELECT * INTO b FROM public.budgets WHERE public_token = _token LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada';
  END IF;

  IF b.aprovada_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'ja_aprovada', true);
  END IF;

  IF coalesce(btrim(_nome), '') = '' OR coalesce(btrim(_email), '') = '' THEN
    RAISE EXCEPTION 'Informe nome e e-mail';
  END IF;

  UPDATE public.budgets
     SET aprovada_em = now(),
         aprovada_por = jsonb_build_object('nome', _nome, 'email', _email, 'celular', _celular)
   WHERE id = b.id;

  UPDATE public.deals SET stage = 'aceite' WHERE id = b.deal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.carta_publica(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carta_aprovar(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carta_gerar_token(uuid) TO authenticated;
