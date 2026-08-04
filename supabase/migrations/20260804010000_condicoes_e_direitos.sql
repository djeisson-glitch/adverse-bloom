-- =========================================================================
-- Condições e direitos: o que está e o que NÃO está incluso
--
-- "Não inclui" em texto livre falha justamente onde dói: o cliente aprova, e
-- três semanas depois pergunta cadê a janela de Libras — ou descobre na
-- entrega que o filme não pode ir pra TV porque ninguém registrou na ANCINE.
--
-- `budgets.condicoes` guarda a lista com STATUS por item (incluso / não
-- incluso / sob consulta / não se aplica), os regimes da ANCINE e o período e
-- a praça de veiculação orçados. Não dizer nada sobre Libras é diferente de
-- dizer "não incluso", e as duas coisas são diferentes de "sob consulta" — por
-- isso status explícito, não presença numa lista.
--
-- Sai na carta do cliente (carta_publica) e no orçamento compartilhado, junto
-- do escopo: as duas respondem "o que eu recebo no fim", e separar em duas
-- flags só faria alguém mandar metade.
--
-- Partiu da definição vigente do 20260804000000.
-- =========================================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS condicoes jsonb;

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
  ver_esc  boolean;
  ver_res  boolean;
  itens    jsonb;
  grupos   jsonb;
  soma     numeric := 0;   -- custo de produção (soma das linhas)
  custo_r  numeric := 0;   -- custo real das linhas
  base_tx  numeric := 0;   -- base da margem (linhas dentro da taxa)
  margem_v numeric := 0;
  sub2     numeric := 0;
  com_v    numeric := 0;
  imp_v    numeric := 0;
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
  ver_esc := COALESCE((m->>'escopo')::boolean, false);
  ver_res := COALESCE((m->>'resumo')::boolean, false);

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

  -- Os totais são calculados SEMPRE (não dependem das flags): as flags
  -- decidem quais deles saem no JSON, lá embaixo.
  SELECT
    COALESCE(SUM(COALESCE(bi.quantity,0) * COALESCE(bi.diaria,1) * COALESCE(bi.client_unit_price,0)), 0),
    COALESCE(SUM(COALESCE(bi.quantity,0) * COALESCE(bi.diaria,1) * COALESCE(bi.custo_unitario,0)), 0),
    COALESCE(SUM(CASE WHEN COALESCE(bi.tira_taxa, false) THEN 0
                      ELSE COALESCE(bi.quantity,0) * COALESCE(bi.diaria,1) * COALESCE(bi.client_unit_price,0)
                 END), 0)
    INTO soma, custo_r, base_tx
    FROM public.budget_items bi
   WHERE bi.budget_id = b.id;

  margem_v := base_tx * COALESCE(b.margem_produtora_percent, 0) / 100;
  sub2     := soma + margem_v;

  SELECT COALESCE(SUM(
           CASE WHEN c->>'tipo' = '%'
                THEN (CASE WHEN b.comissao_base = 'subtotal1' THEN soma ELSE sub2 END)
                     * COALESCE((c->>'valor')::numeric, 0) / 100
                ELSE COALESCE((c->>'valor')::numeric, 0)
           END), 0)
    INTO com_v
    FROM jsonb_array_elements(COALESCE(b.comissoes, '[]'::jsonb)) c;

  imp_v := (sub2 + com_v) * COALESCE(b.imposto_percent, 0) / 100;

  -- Linhas: a descrição e as quantidades sempre vão (é a estrutura do job);
  -- preço e custo entram só se a flag deixar.
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'cat_ordem', x->>'ordem'), '[]'::jsonb)
    INTO itens
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
      'observacoes', ver_obs, 'escopo', ver_esc, 'resumo', ver_res
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
    -- Escopo e resumo sempre com CASE: sem a flag, nem o campo existe no JSON.
    'escopo', CASE WHEN ver_esc THEN COALESCE(b.entregas, '[]'::jsonb) END,
    'condicoes', CASE WHEN ver_esc THEN b.condicoes END,
    'resumo', CASE WHEN ver_res THEN b.resumo_ia END,
    'totais', jsonb_build_object(
      'custo_producao',  CASE WHEN ver_val THEN soma END,
      'total',           CASE WHEN ver_val THEN b.total_value END,
      -- A margem em REAIS acompanha a rentabilidade: é o que a produtora
      -- ganha. O percentual sozinho não fecha a conta de quem confere.
      'margem_percent',  CASE WHEN ver_ren THEN b.margem_produtora_percent END,
      'margem_valor',    CASE WHEN ver_ren THEN margem_v END,
      'base_taxa',       CASE WHEN ver_ren THEN base_tx END,
      'imposto_percent', CASE WHEN ver_imp THEN b.imposto_percent END,
      'imposto_valor',   CASE WHEN ver_imp THEN imp_v END,
      'comissao_valor',  CASE WHEN ver_com THEN com_v END,
      'custo_real',      CASE WHEN ver_cus THEN custo_r END,
      -- Arredondamento pra cima de 50 em 50: sem isso a soma das partes não
      -- bate com o total impresso e parece erro de conta.
      'arredondamento',  CASE WHEN ver_val
                              THEN COALESCE(b.total_value, 0) - (sub2 + com_v + imp_v) END
    ),
    'comissoes',     CASE WHEN ver_com THEN COALESCE(b.comissoes, '[]'::jsonb) END,
    'comissao_base', CASE WHEN ver_com THEN b.comissao_base END,
    'emitido_em',    now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.orcamento_compartilhado(uuid) TO anon, authenticated;


-- Carta do cliente passa a levar as condições junto (parte da definição
-- vigente do 20260713190000, não reescrita de memória).
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
