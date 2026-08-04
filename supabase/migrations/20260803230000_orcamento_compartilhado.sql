-- =========================================================================
-- Compartilhar um orçamento por link, escolhendo o que o outro lado vê
--
-- O caso é mostrar a planilha pra alguém de fora do sistema — um mentor, um
-- sócio, um cliente de confiança — sem criar usuário e sem abrir o resto.
-- E cada camada de informação é uma escolha separada: dá pra mostrar a
-- estrutura sem preço, o preço sem custo, ou tudo.
--
-- Não reaproveita `budgets.public_token` (a carta do cliente) de propósito:
-- são públicos diferentes, e revogar o link do mentor não pode derrubar a
-- carta que o cliente já tem na mão.
--
-- O QUE ESCONDE, ESCONDE NO BANCO. As flags são aplicadas dentro da função
-- que monta o JSON: o campo oculto não sai do Postgres. Filtrar no front
-- seria teatro — bastaria abrir o DevTools pra ver o custo que se quis
-- esconder.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.budget_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id   uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  token       uuid NOT NULL DEFAULT gen_random_uuid(),
  -- De quem é o link. Sem isso, três links na tela viram adivinhação na hora
  -- de revogar o certo.
  nome        text NOT NULL,
  -- O que este link mostra. jsonb pra poder ganhar camada nova sem migration.
  mostrar     jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expira_em   timestamptz,
  revogado_em timestamptz,
  -- Saber se abriram (e quando) responde "ele já viu?" sem precisar perguntar.
  visitas     integer NOT NULL DEFAULT 0,
  visto_em    timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS budget_shares_token_idx ON public.budget_shares (token);
CREATE INDEX IF NOT EXISTS budget_shares_budget_idx ON public.budget_shares (budget_id);

ALTER TABLE public.budget_shares ENABLE ROW LEVEL SECURITY;

-- Quem enxerga dinheiro administra os links. Quem não enxerga não tem o que
-- compartilhar — e não pode criar uma porta pra fora do que ele mesmo não vê.
DROP POLICY IF EXISTS budget_shares_rw ON public.budget_shares;
CREATE POLICY budget_shares_rw ON public.budget_shares
  FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro())
  WITH CHECK (public.pode_ver_dinheiro());

-- ---------------------------------------------------------------- leitura

/**
 * Página pública do orçamento compartilhado.
 *
 * Sem login: valida o token, conta a visita e devolve só as camadas que o
 * link autoriza. Token revogado ou vencido devolve NULL — a página trata
 * como "link não vale mais", que é diferente de "não existe".
 */
CREATE OR REPLACE FUNCTION public.orcamento_compartilhado(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s        record;
  b        record;
  d        record;
  m        jsonb;
  ver_val  boolean;
  ver_cus  boolean;
  ver_ren  boolean;
  ver_com  boolean;
  ver_imp  boolean;
  ver_bri  boolean;
  ver_obs  boolean;
  itens    jsonb;
  grupos   jsonb;
  soma     numeric := 0;
BEGIN
  SELECT * INTO s FROM public.budget_shares WHERE token = _token LIMIT 1;
  IF NOT FOUND OR s.revogado_em IS NOT NULL
     OR (s.expira_em IS NOT NULL AND s.expira_em < now()) THEN
    RETURN NULL;
  END IF;

  UPDATE public.budget_shares
     SET visitas = visitas + 1, visto_em = now()
   WHERE id = s.id;

  m       := COALESCE(s.mostrar, '{}'::jsonb);
  ver_val := COALESCE((m->>'valores')::boolean, false);
  ver_cus := COALESCE((m->>'custos')::boolean, false);
  ver_ren := COALESCE((m->>'rentabilidade')::boolean, false);
  ver_com := COALESCE((m->>'comissoes')::boolean, false);
  ver_imp := COALESCE((m->>'impostos')::boolean, false);
  ver_bri := COALESCE((m->>'briefing')::boolean, false);
  ver_obs := COALESCE((m->>'observacoes')::boolean, false);

  -- Custo sem valor não faz sentido de ler (não dá pra saber a sobra de quê),
  -- e rentabilidade é conta feita em cima do valor. As duas dependem de valor.
  IF NOT ver_val THEN
    ver_cus := false;
    ver_ren := false;
  END IF;

  SELECT * INTO b FROM public.budgets WHERE id = s.budget_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT dd.title, dd.numero, dd.objetivo, dd.tipo_orcamento,
         dd.local_filmagem, dd.formatos,
         c.name AS client_name
    INTO d
    FROM public.deals dd
    LEFT JOIN public.clients c ON c.id = dd.client_id
   WHERE dd.id = b.deal_id;

  -- Linhas: a descrição e as quantidades sempre vão (é a estrutura do job);
  -- preço e custo entram só se a flag deixar.
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'cat_ordem', x->>'ordem'), '[]'::jsonb),
         COALESCE(SUM((x->>'valor')::numeric), 0)
    INTO itens, soma
    FROM (
      SELECT jsonb_build_object(
               'id',        bi.id,
               'cat_codigo', cat.codigo,
               'cat_nome',   cat.nome,
               'cat_ordem',  LPAD(COALESCE(cat.ordem, 999)::text, 4, '0'),
               'ordem',      LPAD(COALESCE(bi.ordem, 999)::text, 4, '0'),
               'descricao',  COALESCE(bi.descricao, bi.item_name),
               'quantity',   bi.quantity,
               'diaria',     bi.diaria,
               'tira_taxa',  bi.tira_taxa,
               'observacoes', CASE WHEN ver_obs THEN bi.observacoes END,
               'unit',       CASE WHEN ver_val THEN bi.client_unit_price END,
               'valor',      CASE WHEN ver_val
                                  THEN COALESCE(bi.quantity,0) * COALESCE(bi.diaria,1)
                                       * COALESCE(bi.client_unit_price,0) END,
               'custo_unit', CASE WHEN ver_cus THEN bi.custo_unitario END,
               'custo',      CASE WHEN ver_cus
                                  THEN COALESCE(bi.quantity,0) * COALESCE(bi.diaria,1)
                                       * COALESCE(bi.custo_unitario,0) END
             ) AS x
        FROM public.budget_items bi
        LEFT JOIN public.budget_categorias cat ON cat.id = bi.categoria_id
       WHERE bi.budget_id = b.id
    ) t;

  -- Peso por grupo: só faz sentido com valor à vista.
  IF ver_val THEN
    SELECT COALESCE(jsonb_agg(g ORDER BY g->>'ordem'), '[]'::jsonb) INTO grupos
      FROM (
        SELECT jsonb_build_object(
                 'codigo', cat.codigo,
                 'nome',   cat.nome,
                 'ordem',  LPAD(COALESCE(cat.ordem, 999)::text, 4, '0'),
                 'total',  SUM(COALESCE(bi.quantity,0) * COALESCE(bi.diaria,1)
                               * COALESCE(bi.client_unit_price,0))
               ) AS g
          FROM public.budget_items bi
          LEFT JOIN public.budget_categorias cat ON cat.id = bi.categoria_id
         WHERE bi.budget_id = b.id
         GROUP BY cat.codigo, cat.nome, cat.ordem
      ) t;
  ELSE
    grupos := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'compartilhado_com', s.nome,
    'mostra', jsonb_build_object(
      'valores', ver_val, 'custos', ver_cus, 'rentabilidade', ver_ren,
      'comissoes', ver_com, 'impostos', ver_imp, 'briefing', ver_bri,
      'observacoes', ver_obs
    ),
    'job', jsonb_build_object(
      'titulo',   d.title,
      'numero',   d.numero,
      'cliente',  d.client_name,
      'tipo',     d.tipo_orcamento,
      'objetivo', CASE WHEN ver_bri THEN d.objetivo END,
      'local',    CASE WHEN ver_bri THEN d.local_filmagem END,
      'formatos', CASE WHEN ver_bri THEN to_jsonb(d.formatos) END
    ),
    'itens',  itens,
    'grupos', grupos,
    'totais', jsonb_build_object(
      'custo_producao', CASE WHEN ver_val THEN soma END,
      'total',          CASE WHEN ver_val THEN b.total_value END,
      'margem_percent', CASE WHEN ver_ren THEN b.margem_produtora_percent END,
      'imposto_percent', CASE WHEN ver_imp THEN b.imposto_percent END
    ),
    'comissoes',     CASE WHEN ver_com THEN COALESCE(b.comissoes, '[]'::jsonb) END,
    'comissao_base', CASE WHEN ver_com THEN b.comissao_base END,
    'emitido_em',    now()
  );
END;
$$;

-- anon É o ponto: o mentor não tem login.
GRANT EXECUTE ON FUNCTION public.orcamento_compartilhado(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------- escrita

/** Cria um link. Devolve a linha pronta pra tela montar a URL. */
CREATE OR REPLACE FUNCTION public.orcamento_share_criar(
  _budget_id uuid, _nome text, _mostrar jsonb, _dias integer DEFAULT NULL)
RETURNS public.budget_shares
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  novo public.budget_shares;
BEGIN
  IF NOT public.pode_ver_dinheiro() THEN
    RAISE EXCEPTION 'Sem permissão para compartilhar orçamento';
  END IF;
  INSERT INTO public.budget_shares (budget_id, nome, mostrar, criado_por, expira_em)
  VALUES (_budget_id, COALESCE(NULLIF(btrim(_nome), ''), 'Sem nome'),
          COALESCE(_mostrar, '{}'::jsonb), auth.uid(),
          CASE WHEN _dias IS NULL THEN NULL ELSE now() + (_dias || ' days')::interval END)
  RETURNING * INTO novo;
  RETURN novo;
END;
$$;
GRANT EXECUTE ON FUNCTION public.orcamento_share_criar(uuid, text, jsonb, integer) TO authenticated;
