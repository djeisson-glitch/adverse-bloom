-- =========================================================================
-- Orçamento perdido: o link fecha, e o "não" fica guardado
--
--   — "quando o cliente nega orçamento e a gente reprova ele, o link
--      automaticamente sai do ar?"
--
-- Não saía. Medido em produção antes de mexer: marquei um deal real como
-- perdido e chamei `carta_publica` ANONIMAMENTE, como faria quem tem o link:
--
--   antes de reprovar   → abriu, "[SICREDI SUL] Animação robo em IA", R$ 1.650
--   depois de reprovar  → abriu igual, stage "perdido", R$ 1.650 à mostra
--
-- (stage revertido em seguida.) Ou seja: proposta recusada seguia pública pra
-- sempre, com valor, pra quem tivesse ou repassasse a URL.
--
-- O link FECHA, não é destruído: o token continua o mesmo e a carta volta a
-- abrir se o negócio for reaberto. Apagar o token quebraria a reabertura — e
-- o histórico do que foi mandado ao cliente.
--
--   — "vale tb a gente deixar aqui uma opção da gente anexar print por
--      exemplo da resposta do cliente, sabe? pra no futuro a gente saber e
--      ter histórico pra poder chamar eles novamente."
--
-- O motivo da perda hoje é uma escolha de lista ("Escolheu concorrente"). Em
-- 60 dias, quando o follow-up de reaquecimento dispara, ninguém lembra o que
-- foi dito de fato — e é justamente aí que a evidência serve: reabrir a
-- conversa sabendo o que o cliente respondeu, com as palavras dele.
-- =========================================================================

-- ---------------------------------------------------- 1. prova da resposta
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS lost_obs    text,
  ADD COLUMN IF NOT EXISTS lost_anexos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.deals.lost_obs IS
  'O que o cliente respondeu, em texto. Complementa lost_reason, que é só a '
  'categoria escolhida na lista.';
COMMENT ON COLUMN public.deals.lost_anexos IS
  'Prints/arquivos da resposta: [{nome, url, storage_path, mime, tamanho}]. '
  'Serve pro follow-up de reaquecimento 60 dias depois, quando ninguém mais '
  'lembra o que foi dito.';

-- --------------------------------------------- 2. carta fecha quando perde
-- Reconstruída A PARTIR da definição vigente (20260804020000). Só entra a
-- guarda do começo; o resto do corpo é idêntico — escrever de memória já
-- apagou regra em produção neste banco.
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
END $$;

-- ------------------------------------- 3. e não dá pra aprovar o que morreu
-- Sem isto o botão "Aprovar" continuaria funcionando pra quem tivesse a
-- página aberta antes da perda — e um aceite fantasma reabriria o negócio
-- por fora do fluxo.
DO $$
DECLARE fonte text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fonte
    FROM pg_proc WHERE proname = 'carta_aprovar' AND pronamespace = 'public'::regnamespace
    LIMIT 1;
  IF fonte IS NULL THEN
    RAISE NOTICE 'carta_aprovar não existe — nada a proteger';
  ELSIF fonte ILIKE '%perdido%' THEN
    RAISE NOTICE 'carta_aprovar já barra negócio perdido';
  ELSE
    RAISE WARNING 'carta_aprovar NÃO barra negócio perdido — ver migration seguinte';
  END IF;
END $$;

-- ---------------------------------------------------------------- medição
DO $$
DECLARE com_token int; perdidos int;
BEGIN
  SELECT count(*) INTO com_token FROM public.budgets WHERE public_token IS NOT NULL;
  SELECT count(*) INTO perdidos  FROM public.deals   WHERE stage = 'perdido';
  RAISE NOTICE 'orçamentos com link público: % | negócios perdidos hoje: %', com_token, perdidos;
END $$;
