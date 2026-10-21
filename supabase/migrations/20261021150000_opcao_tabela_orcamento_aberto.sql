BEGIN;

CREATE OR REPLACE FUNCTION public.orcamento_aplicar_tabela_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg jsonb;
BEGIN
 IF NEW.parent_budget_id IS NOT NULL THEN
   -- A cópia informa o regime da opção de origem; a raiz pode usar outra regra.
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

CREATE OR REPLACE FUNCTION public.orcamento_criar_variante(
  _budget_id uuid,
  _nome text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.budgets%ROWTYPE;
  raiz uuid;
  novo uuid;
BEGIN
  SELECT * INTO o FROM public.budgets WHERE id = _budget_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orçamento não encontrado';
  END IF;
  IF _nome IS NULL OR btrim(_nome) = '' THEN
    RAISE EXCEPTION 'a variante precisa de um nome — é como ela aparece pro cliente';
  END IF;

  -- Variante de variante continua pendurada na MESMA raiz. Sem isto, duplicar a
  -- "Opção B" criaria uma árvore, e a terceira opção não apareceria ao lado das
  -- outras duas — apareceria dentro de uma delas.
  raiz := COALESCE(o.parent_budget_id, o.id);

  INSERT INTO public.budgets (
    precos_finais, deal_id, client_id, project_name, client_name, proposal_name,
    status, markup_percent, tax_percent, bv_percent, commission_percent,
    discount, addition, capture_days, project_count,
    margem_produtora_percent, imposto_percent, direcao_cena_percent,
    comissoes, comissao_base, entregas, proposta, not_included,
    categorias_ocultas, notas, internal_notes,
    budget_number, version, is_latest_version,
    parent_budget_id, variante_nome, created_by
  )
  SELECT
    o.precos_finais, o.deal_id, o.client_id, o.project_name, o.client_name, o.proposal_name,
    'draft', o.markup_percent, o.tax_percent, o.bv_percent, o.commission_percent,
    o.discount, o.addition, o.capture_days, o.project_count,
    o.margem_produtora_percent, o.imposto_percent, o.direcao_cena_percent,
    o.comissoes, o.comissao_base, o.entregas, o.proposta, o.not_included,
    o.categorias_ocultas, o.notas, o.internal_notes,
    o.budget_number, o.version, true,
    raiz, btrim(_nome), o.created_by
  RETURNING id INTO novo;

  -- O que NÃO se copia, e por quê:
  --   public_token  — cada opção precisa do próprio link, senão abrir uma
  --                   mostra a outra;
  --   aprovacoes / aprovada_em / aprovada_por — aprovação é da proposta que o
  --                   cliente leu; nascer aprovada é o pior default possível;
  --   status        — volta a 'draft', porque é uma proposta nova.

  INSERT INTO public.budget_items (
    budget_id, categoria_id, category, item_name, descricao, group_name,
    quantity, unit_type, client_price, client_unit_price, client_days, client_people,
    supplier_cost, supplier_unit_price, supplier_days, supplier_people,
    custo_unitario, has_supplier_cost, diaria, tira_taxa,
    is_deliverable, delivery_duration, delivery_formats,
    observacoes, margin_value, margin_percent, ordem, order_index
  )
  SELECT
    novo, i.categoria_id, i.category, i.item_name, i.descricao, i.group_name,
    i.quantity, i.unit_type, i.client_price, i.client_unit_price, i.client_days, i.client_people,
    i.supplier_cost, i.supplier_unit_price, i.supplier_days, i.supplier_people,
    i.custo_unitario, i.has_supplier_cost, i.diaria, i.tira_taxa,
    i.is_deliverable, i.delivery_duration, i.delivery_formats,
    i.observacoes, i.margin_value, i.margin_percent, i.ordem, i.order_index
  FROM public.budget_items i
  WHERE i.budget_id = _budget_id;

  RETURN novo;
END;
$$;


CREATE OR REPLACE FUNCTION public.orcamento_criar_opcao_tabela(
 _budget_id uuid, _nome text, _taxas jsonb, _itens jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.budgets%ROWTYPE; d public.deals%ROWTYPE; cfg jsonb; novo uuid;
        sel record; p public.client_precos%ROWTYPE; n int; esperado numeric:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.pode_ver_dinheiro(auth.uid()) THEN
   RAISE EXCEPTION 'Sem permissão para criar opções de orçamento';
 END IF;
 SELECT * INTO b FROM public.budgets WHERE id=_budget_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado'; END IF;
 SELECT * INTO d FROM public.deals WHERE id=b.deal_id FOR UPDATE;
 IF NOT FOUND OR d.client_id IS NULL OR (b.client_id IS NOT NULL AND b.client_id<>d.client_id) THEN
   RAISE EXCEPTION 'Cliente do orçamento indisponível';
 END IF;
 IF b.fechamento_mes IS NOT NULL OR b.aprovada_em IS NOT NULL
    OR coalesce(b.aprovacoes,'[]'::jsonb) @> '[{"tipo":"aprovacao"}]'::jsonb
    OR b.status IS NULL OR b.status NOT IN ('draft','sent','pending')
    OR d.stage IS NULL OR d.stage NOT IN ('lead','contato','contato_inicial','diagnostico','elaboracao','orcamento','orcamento_em_elaboracao','proposta','negociacao') THEN
   RAISE EXCEPTION 'Disponível apenas para orçamentos abertos, sem aprovação e fora do fechamento mensal';
 END IF;
 IF b.precos_finais THEN RAISE EXCEPTION 'Esta opção já usa a tabela do cliente'; END IF;
 IF _nome IS NULL OR btrim(_nome)='' OR length(btrim(_nome))>80 THEN RAISE EXCEPTION 'Informe um nome de até 80 caracteres'; END IF;
 SELECT orcamento_taxas_inclusas INTO cfg FROM public.client_faturamento
   WHERE client_id=d.client_id AND modelo='tabela' AND precos_finais FOR SHARE;
 IF cfg IS NULL THEN RAISE EXCEPTION 'Cliente sem tabela para orçamentos'; END IF;
 IF cfg IS DISTINCT FROM _taxas THEN RAISE EXCEPTION 'As taxas mudaram. Reabra a tabela para conferir'; END IF;
 IF _itens IS NULL OR jsonb_typeof(_itens)<>'array' THEN RAISE EXCEPTION 'Selecione os serviços'; END IF;
 n:=jsonb_array_length(_itens);
 IF n=0 OR n>(SELECT count(*) FROM public.client_precos WHERE client_id=d.client_id AND ativo) THEN RAISE EXCEPTION 'Seleção de serviços inválida'; END IF;
 IF n<>(SELECT count(DISTINCT x->>'preco_id') FROM jsonb_array_elements(_itens) x) THEN RAISE EXCEPTION 'Serviços repetidos'; END IF;
 -- Valida preços e quantidades ANTES de criar a cópia. Um preço alterado na
 -- tabela enquanto o diálogo estava aberto requer uma nova conferência.
 FOR sel IN SELECT * FROM jsonb_to_recordset(_itens) AS x(preco_id uuid,quantidade numeric,preco_unitario numeric) LOOP
   SELECT * INTO p FROM public.client_precos WHERE id=sel.preco_id AND client_id=d.client_id AND ativo FOR SHARE;
   IF NOT FOUND OR sel.preco_unitario IS DISTINCT FROM p.preco THEN RAISE EXCEPTION 'Um preço mudou. Reabra a tabela para conferir'; END IF;
   IF sel.quantidade IS NULL OR sel.quantidade<=0 OR sel.quantidade::text IN ('NaN','Infinity','-Infinity')
      OR (NOT p.e_diaria AND trunc(sel.quantidade)<>sel.quantidade) THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
   IF p.preco IS NULL OR p.preco<0 THEN RAISE EXCEPTION 'Preço inválido na tabela'; END IF;
   esperado:=esperado+sel.quantidade*p.preco;
 END LOOP;
 novo:=public.orcamento_criar_variante(b.id,btrim(_nome));
 -- Só a cópia recém-criada recebe outra planilha. O original não é escrito.
 DELETE FROM public.budget_items WHERE budget_id=novo;
 UPDATE public.budgets SET client_id=d.client_id,precos_finais=true,
   margem_produtora_percent=(cfg->>'margem')::numeric,imposto_percent=(cfg->>'imposto')::numeric,
   bv_percent=coalesce((cfg->>'bv')::numeric,0),comissoes=coalesce(cfg->'comissoes','[]'::jsonb),
   comissao_base='subtotal1',categorias_ocultas='[]'::jsonb,
   condicoes=b.condicoes,recorrente=b.recorrente,contrato_meses=b.contrato_meses WHERE id=novo;
 -- Insere diretamente por ID do catálogo; descrições não identificam serviços.
 INSERT INTO public.budget_items(budget_id,categoria_id,category,descricao,item_name,quantity,diaria,
    client_unit_price,client_price,custo_unitario,tira_taxa,ordem,unit_type)
 SELECT novo,c.id,c.nome,cp.tipo,cp.tipo,coalesce(s.quantidade,0),1,cp.preco,
   round(coalesce(s.quantidade,0)*cp.preco,2),0,false,cp.ordem,
   CASE WHEN cp.e_diaria THEN 'diaria_tabelada' ELSE 'servico_tabelado' END
 FROM public.client_precos cp
 JOIN public.budget_categorias c ON c.codigo=CASE WHEN cp.e_diaria THEN '007' ELSE '011' END
 LEFT JOIN jsonb_to_recordset(_itens) AS s(preco_id uuid,quantidade numeric,preco_unitario numeric) ON s.preco_id=cp.id
 WHERE cp.client_id=d.client_id AND cp.ativo;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>(SELECT count(*) FROM public.client_precos WHERE client_id=d.client_id AND ativo)
    OR (SELECT total_value FROM public.budgets WHERE id=novo)<>round(esperado,2) THEN
   RAISE EXCEPTION 'Não foi possível montar a tabela completa';
 END IF;
 RETURN novo;
END $$;
REVOKE ALL ON FUNCTION public.orcamento_criar_opcao_tabela(uuid,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orcamento_criar_opcao_tabela(uuid,text,jsonb,jsonb) TO authenticated;
COMMIT;
