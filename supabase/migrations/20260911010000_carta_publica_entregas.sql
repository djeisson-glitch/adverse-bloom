-- carta_publica passa a devolver as ENTREGAS do orçamento (budgets.entregas).
--
-- Djêisson (11/09): "na carta simples e nas outras também, precisa incluir o
-- que está incluso no escopo de entregas". A carta pública só mostrava o texto
-- salvo em proposta.entregas_texto — que só existe se alguém abriu e editou a
-- carta completa. Sem ele, o cliente recebia a carta sem entregas (ROOS).
-- Com isto a tela cai para as entregas do orçamento quando não há texto; o
-- texto escrito na carta continua vencendo.
--
-- Partiu da definição VIGENTE (pg_get_functiondef em 11/09), não de arquivo
-- antigo: a única diferença é a linha 'entregas'. Só escopo — título,
-- formato, duração, quantidade; nenhum valor.

CREATE OR REPLACE FUNCTION public.carta_publica(_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- NEGÓCIO PERDIDO: a carta fecha. Devolve um objeto em vez de NULL pra a
  -- tela poder dizer "esta proposta foi encerrada" — NULL é o mesmo que
  -- "token inválido", e as duas coisas merecem respostas diferentes.
  -- Nada de valor, escopo ou condições vai junto: o que o cliente recusou
  -- não fica exposto na internet.
  IF d.stage = 'perdido' THEN
    RETURN jsonb_build_object('encerrada', true);
  END IF;

  valor := coalesce(nullif(b.total_value, 0), nullif(d.valor_proposta, 0), nullif(d.value, 0), 0);

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
    'condicoes',          b.condicoes,
    'entregas',           coalesce(b.entregas, '[]'::jsonb),
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
END $function$;
