-- =========================================================================
-- Histórico de aprovações da carta + reabertura
--  • budgets.aprovacoes: log append-only de eventos (aprovação / reabertura)
--    pra dar transparência ao cliente.
--  • carta_aprovar: além de marcar a aprovação atual, registra no histórico.
--  • carta_reabrir(deal): limpa a aprovação atual (a carta volta a pedir
--    aprovação), registra a reabertura e devolve o deal pra Negociação.
--  • carta_publica: passa a devolver o histórico.
-- =========================================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS aprovacoes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Aprovação do cliente — marca a atual e acrescenta ao histórico.
CREATE OR REPLACE FUNCTION public.carta_aprovar(
  _token uuid, _nome text, _email text, _celular text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
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
     SET aprovada_em  = now(),
         aprovada_por = jsonb_build_object('nome', _nome, 'email', _email, 'celular', _celular),
         aprovacoes   = coalesce(aprovacoes, '[]'::jsonb)
                        || jsonb_build_object('tipo','aprovacao','nome',_nome,'email',_email,'celular',_celular,'em',now())
   WHERE id = b.id;

  UPDATE public.deals SET stage = 'aceite' WHERE id = b.deal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Reabre a proposta: limpa a aprovação atual, registra a reabertura no
-- histórico e volta o deal pra Negociação.
CREATE OR REPLACE FUNCTION public.carta_reabrir(_deal_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bid uuid;
BEGIN
  UPDATE public.deals SET stage = 'negociacao' WHERE id = _deal_id;

  SELECT id INTO bid FROM public.budgets WHERE deal_id = _deal_id ORDER BY created_at DESC LIMIT 1;
  IF bid IS NOT NULL THEN
    UPDATE public.budgets
       SET aprovacoes  = coalesce(aprovacoes, '[]'::jsonb) || jsonb_build_object('tipo','reabertura','em', now()),
           aprovada_em = NULL,
           aprovada_por = NULL
     WHERE id = bid;
  END IF;
END;
$$;

-- Carta pública — agora devolve o histórico (aprovacoes) também.
CREATE OR REPLACE FUNCTION public.carta_publica(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b     record;
  d     record;
  valor numeric;
BEGIN
  SELECT * INTO b FROM public.budgets WHERE public_token = _token LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT dd.title, dd.objetivo, dd.tipo_orcamento, dd.stage,
         dd.valor_proposta, dd.value,
         c.name AS client_name, c.contact_name AS client_contact,
         c.email AS client_email, c.phone AS client_phone
    INTO d
    FROM public.deals dd
    LEFT JOIN public.clients c ON c.id = dd.client_id
   WHERE dd.id = b.deal_id;

  valor := coalesce(nullif(b.total_value, 0), nullif(d.valor_proposta, 0), nullif(d.value, 0), 0);

  RETURN jsonb_build_object(
    'proposta',           b.proposta,
    'total_value',        b.total_value,
    'valor_investimento', valor,
    'aprovada_em',        b.aprovada_em,
    'aprovada_por',       b.aprovada_por,
    'aprovacoes',         coalesce(b.aprovacoes, '[]'::jsonb),
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

GRANT EXECUTE ON FUNCTION public.carta_reabrir(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.carta_aprovar(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carta_publica(uuid) TO anon, authenticated;
