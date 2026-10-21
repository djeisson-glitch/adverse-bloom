BEGIN;

-- Defaults exclusivos de novos orçamentos; o fechamento mensal usa suas
-- próprias colunas e não é recalculado por esta configuração.
ALTER TABLE public.client_faturamento ADD COLUMN IF NOT EXISTS orcamento_taxas_inclusas jsonb;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS precos_finais boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.budgets.precos_finais IS
 'Snapshot: preços unitários são finais. Margem, imposto, BV e comissão são descontados por dentro.';

UPDATE public.client_faturamento
 SET orcamento_taxas_inclusas = jsonb_build_object(
   'imposto',12,'margem',37.68,'bv',0,
   'comissoes',jsonb_build_array(jsonb_build_object('nome','Djêisson','tipo','%','valor',4)))
 WHERE client_id='d3a96591-55b7-4b64-a445-72aaa28eb950'
   AND modelo='tabela' AND precos_finais AND orcamento_taxas_inclusas IS NULL;

CREATE OR REPLACE FUNCTION public.orcamento_aplicar_tabela_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg jsonb;
BEGIN
 IF NEW.parent_budget_id IS NOT NULL THEN
   -- Variantes mantêm o regime do orçamento de origem, inclusive os antigos.
   SELECT precos_finais INTO NEW.precos_finais FROM public.budgets WHERE id=NEW.parent_budget_id;
   NEW.precos_finais := coalesce(NEW.precos_finais,false);
   RETURN NEW;
 END IF;
 IF NEW.deal_id IS NULL OR NEW.fechamento_mes IS NOT NULL OR NEW.status <> 'draft' THEN RETURN NEW; END IF;
 IF NEW.client_id IS NULL THEN
   SELECT client_id INTO NEW.client_id FROM public.deals WHERE id=NEW.deal_id;
 END IF;
 SELECT orcamento_taxas_inclusas INTO cfg FROM public.client_faturamento
 WHERE client_id=NEW.client_id AND modelo='tabela' AND precos_finais;
 IF cfg IS NULL THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.client_precos WHERE client_id=NEW.client_id AND ativo) THEN
   RAISE EXCEPTION 'A tabela do cliente não possui preços ativos';
 END IF;
 NEW.precos_finais := true;
 NEW.margem_produtora_percent := (cfg->>'margem')::numeric;
 NEW.imposto_percent := (cfg->>'imposto')::numeric;
 NEW.bv_percent := coalesce((cfg->>'bv')::numeric,0);
 NEW.comissoes := coalesce(cfg->'comissoes','[]'::jsonb);
 -- Compatível com o enum legado; em precos_finais esta base é o valor final.
 NEW.comissao_base := 'subtotal1';
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.orcamento_aplicar_tabela_cliente() FROM PUBLIC;
CREATE TRIGGER orcamento_tabela_cliente BEFORE INSERT ON public.budgets
 FOR EACH ROW EXECUTE FUNCTION public.orcamento_aplicar_tabela_cliente();

CREATE OR REPLACE FUNCTION public.seed_budget_items(_budget_id uuid, _porte text DEFAULT 'grande')
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted int;
BEGIN
 IF _porte IS NULL OR _porte NOT IN ('grande', 'medio', 'pequeno', 'jogo_rapido') THEN
  RAISE EXCEPTION 'Porte de orçamento inválido: %', _porte;
 END IF;
 -- Serializa tentativas de carregamento e nunca altera uma planilha existente.
 PERFORM 1 FROM public.budgets WHERE id = _budget_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento indisponível'; END IF;
 IF EXISTS (SELECT 1 FROM public.budget_items WHERE budget_id = _budget_id) THEN RETURN 0; END IF;

 IF EXISTS (SELECT 1 FROM public.budgets WHERE id=_budget_id AND precos_finais) THEN
   INSERT INTO public.budget_items
    (budget_id,categoria_id,category,descricao,item_name,quantity,diaria,
     client_unit_price,client_price,custo_unitario,tira_taxa,ordem,unit_type)
   SELECT b.id,c.id,c.nome,p.tipo,p.tipo,0,1,p.preco,0,0,false,p.ordem,
          CASE WHEN p.e_diaria THEN 'diaria_tabelada' ELSE 'servico_tabelado' END
   FROM public.budgets b JOIN public.client_precos p ON p.client_id=b.client_id AND p.ativo
   JOIN public.budget_categorias c ON c.codigo=CASE WHEN p.e_diaria THEN '007' ELSE '011' END
   WHERE b.id=_budget_id ORDER BY p.ordem;
   GET DIAGNOSTICS inserted = ROW_COUNT;
   IF inserted = 0 OR inserted <> (SELECT count(*) FROM public.client_precos p
      JOIN public.budgets b ON b.client_id=p.client_id WHERE b.id=_budget_id AND p.ativo) THEN
     RAISE EXCEPTION 'Confira a tabela do cliente e as categorias 007 e 011';
   END IF;
   RETURN inserted;
 END IF;


 WITH modelos AS (
  SELECT t.*, (t.categoria_codigo, t.descricao) IN (
   ('007', 'Operador(a) de Câmera'), ('007', '1º Assistente de Câmera'),
   ('011', 'Edição / Montagem'), ('004', 'Deslocamento')) AS essencial
  FROM public.budget_item_templates t
 )
 INSERT INTO public.budget_items
  (budget_id, categoria_id, category, descricao, item_name,
   quantity, diaria, client_unit_price, client_price, custo_unitario, tira_taxa, ordem)
 SELECT _budget_id, c.id, c.nome, t.descricao, t.descricao,
  CASE WHEN t.essencial THEN 1 ELSE 0 END, 1, t.valor_unitario,
  CASE WHEN t.essencial THEN t.valor_unitario ELSE 0 END,
  t.custo_unitario, false, t.ordem
 FROM modelos t
 JOIN public.budget_categorias c ON c.codigo = t.categoria_codigo
 WHERE t.essencial OR _porte = 'grande' OR (_porte = 'medio' AND t.no_medio)
 ORDER BY c.ordem, t.ordem;
 GET DIAGNOSTICS inserted = ROW_COUNT;
 RETURN inserted;
END $$;


-- Criação e catálogo são atômicos: falha na tabela reverte o orçamento.
CREATE OR REPLACE FUNCTION public.orcamento_popular_tabela_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.precos_finais AND NEW.parent_budget_id IS NULL THEN
   PERFORM public.seed_budget_items(NEW.id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.orcamento_popular_tabela_cliente() FROM PUBLIC;
CREATE TRIGGER orcamento_popular_tabela AFTER INSERT ON public.budgets
 FOR EACH ROW EXECUTE FUNCTION public.orcamento_popular_tabela_cliente();

-- Mantém o preço final em sincronia também antes de a tela atualizar.
CREATE OR REPLACE FUNCTION public.orcamento_total_tabela()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bid uuid;
BEGIN
 FOR bid IN SELECT DISTINCT x FROM unnest(ARRAY[
   CASE WHEN TG_OP <> 'INSERT' THEN OLD.budget_id END,
   CASE WHEN TG_OP <> 'DELETE' THEN NEW.budget_id END]) x WHERE x IS NOT NULL LOOP
   UPDATE public.budgets b SET total_value=(
     SELECT round(coalesce(sum(i.quantity*coalesce(i.diaria,1)*i.client_unit_price),0),2)
     FROM public.budget_items i WHERE i.budget_id=b.id
       AND NOT (coalesce(b.categorias_ocultas,'[]'::jsonb) ? coalesce(i.categoria_id::text,'')))
   WHERE b.id=bid AND b.precos_finais;
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.orcamento_total_tabela() FROM PUBLIC;
CREATE TRIGGER orcamento_total_tabela AFTER INSERT OR UPDATE OR DELETE ON public.budget_items
 FOR EACH ROW EXECUTE FUNCTION public.orcamento_total_tabela();

CREATE OR REPLACE FUNCTION public.orcamento_recalcular_total_tabela()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.precos_finais THEN
   SELECT round(coalesce(sum(i.quantity*coalesce(i.diaria,1)*i.client_unit_price),0),2)
   INTO NEW.total_value FROM public.budget_items i WHERE i.budget_id=NEW.id
     AND NOT (coalesce(NEW.categorias_ocultas,'[]'::jsonb) ? coalesce(i.categoria_id::text,''));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.orcamento_recalcular_total_tabela() FROM PUBLIC;
CREATE TRIGGER orcamento_recalcular_total_tabela BEFORE UPDATE ON public.budgets
 FOR EACH ROW EXECUTE FUNCTION public.orcamento_recalcular_total_tabela();

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
  bv_v numeric := 0;
  base_liquida numeric := 0;
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
   WHERE bi.budget_id = b.id
     AND (NOT b.precos_finais OR (bi.quantity > 0 AND NOT (coalesce(b.categorias_ocultas,'[]'::jsonb) ? coalesce(bi.categoria_id::text,''))));

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

  base_liquida := soma;
  IF b.precos_finais THEN
    soma := round(soma,2);
    margem_v := round(base_tx * coalesce(b.margem_produtora_percent,0)/100,2);
    imp_v := round(soma * coalesce(b.imposto_percent,0)/100,2);
    bv_v := round(soma * coalesce(b.bv_percent,0)/100,2);
    SELECT round(coalesce(sum(CASE WHEN c->>'tipo'='%' THEN soma*(c->>'valor')::numeric/100
      ELSE (c->>'valor')::numeric END),0),2) INTO com_v
      FROM jsonb_array_elements(coalesce(b.comissoes,'[]'::jsonb)) c;
    base_liquida := soma-margem_v-imp_v-bv_v-com_v;
  END IF;

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
     AND (NOT b.precos_finais OR (bi.quantity > 0 AND NOT (coalesce(b.categorias_ocultas,'[]'::jsonb) ? coalesce(bi.categoria_id::text,''))))
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
     AND (NOT b.precos_finais OR (bi.quantity > 0 AND NOT (coalesce(b.categorias_ocultas,'[]'::jsonb) ? coalesce(bi.categoria_id::text,''))))
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
      'custo_producao',  CASE WHEN ver_val THEN base_liquida END,
      'precos_finais', b.precos_finais,
      'bv_valor', CASE WHEN ver_imp AND b.precos_finais THEN bv_v END,
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
                              THEN CASE WHEN b.precos_finais THEN 0 ELSE COALESCE(b.total_value, 0) - (sub2 + com_v + imp_v) END END
    ),
    'comissoes',     CASE WHEN ver_com THEN COALESCE(b.comissoes, '[]'::jsonb) END,
    'comissao_base', CASE WHEN ver_com THEN b.comissao_base END,
    'emitido_em',    now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.orcamento_compartilhado(uuid) TO anon, authenticated;



COMMIT;
