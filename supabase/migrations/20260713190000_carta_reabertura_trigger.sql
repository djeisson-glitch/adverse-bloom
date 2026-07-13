-- =========================================================================
-- Reabertura robusta da carta (por qualquer caminho)
--  • Trigger: quando o deal SAI de um estágio ganho (aceite/fechado_ganho)
--    — seja pelo botão "Reabrir" ou arrastando o card no board — limpa a
--    aprovação da carta e registra a reabertura no histórico.
--  • carta_reabrir passa a só mudar o estágio (o trigger cuida da carta).
--  • carta_publica devolve o estágio atual do deal, pra carta pública tratar
--    como "aguardando aprovação" quando o deal não está mais ganho.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_deal_reabertura()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.stage IN ('aceite','fechado_ganho')
     AND NEW.stage NOT IN ('aceite','fechado_ganho') THEN
    UPDATE public.budgets
       SET aprovada_em  = NULL,
           aprovada_por = NULL,
           aprovacoes   = coalesce(aprovacoes, '[]'::jsonb) || jsonb_build_object('tipo','reabertura','em', now())
     WHERE id = (SELECT id FROM public.budgets WHERE deal_id = NEW.id ORDER BY created_at DESC LIMIT 1)
       AND aprovada_em IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_reabertura ON public.deals;
CREATE TRIGGER trg_deal_reabertura
  AFTER UPDATE OF stage ON public.deals
  FOR EACH ROW
  WHEN (OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.tg_deal_reabertura();

-- carta_reabrir agora só muda o estágio — o trigger limpa a carta.
CREATE OR REPLACE FUNCTION public.carta_reabrir(_deal_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.deals SET stage = 'negociacao' WHERE id = _deal_id;
END;
$$;

-- carta_publica: devolve o estágio do deal também.
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
      'tipo_orcamento', d.tipo_orcamento,
      'stage',          d.stage
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
GRANT EXECUTE ON FUNCTION public.carta_publica(uuid) TO anon, authenticated;
