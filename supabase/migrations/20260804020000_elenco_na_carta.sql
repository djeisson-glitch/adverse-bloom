-- =========================================================================
-- Elenco na carta do cliente
--
-- Quando tem gente na frente da câmera, o cliente precisa saber o que está
-- contratando: quantas pessoas, por quantas diárias, e por quanto tempo o uso
-- de imagem vale. Sem isso, "posso usar essa peça de novo ano que vem?" só
-- aparece quando já é tarde.
--
-- Vai SEM valor: é escopo, não planilha. A carta continua mostrando um número
-- só de investimento.
--
-- Partiu da definição vigente do 20260804010000.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.carta_publica(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  elenco jsonb;
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

  -- Elenco: quem aparece no filme, sem valor nenhum. O cliente precisa saber
  -- quanta gente está contratada e por quanto tempo o uso de imagem vale —
  -- é a parte da proposta que vira problema quando fica implícita.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'nome',    COALESCE(bi.descricao, bi.item_name),
           'qtd',     bi.quantity,
           'diarias', bi.diaria
         ) ORDER BY bi.ordem), '[]'::jsonb)
    INTO elenco
    FROM public.budget_items bi
    JOIN public.budget_categorias cat ON cat.id = bi.categoria_id
   WHERE bi.budget_id = b.id
     AND cat.codigo = '006'
     AND COALESCE(bi.quantity,0) * COALESCE(bi.diaria,1) * COALESCE(bi.client_unit_price,0) > 0;

  RETURN jsonb_build_object(
    'elenco',             elenco,
    'proposta',           b.proposta,
    -- Condições e direitos: o que está e o que não está incluso. Vai pro
    -- cliente junto da proposta, que é onde a discussão se evita.
    'condicoes',          b.condicoes,
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
GRANT EXECUTE ON FUNCTION public.carta_publica(uuid) TO anon, authenticated;
