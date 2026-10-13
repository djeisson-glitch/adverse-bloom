BEGIN;

-- Mantém preços/custos já cadastrados. Deslocamento novo fica sem preço até
-- ser configurado no catálogo ou no próprio orçamento.
INSERT INTO public.budget_item_templates (categoria_codigo, descricao, ordem)
VALUES
 ('007', 'Operador(a) de Câmera', 10),
 ('007', '1º Assistente de Câmera', 8),
 ('011', 'Edição / Montagem', 1),
 ('004', 'Deslocamento', 12)
ON CONFLICT (categoria_codigo, descricao) DO NOTHING;

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

-- Exercita os quatro portes em um orçamento temporário. Toda a preparação de
-- teste é revertida; não modifica orçamentos reais nem consome sua numeração.
DO $test$
DECLARE b uuid; porte text; n int; esperados int; antes jsonb; depois jsonb;
BEGIN
 BEGIN
  INSERT INTO public.budgets (project_name, client_name, budget_number)
   VALUES ('Teste de portes (rollback)', 'Teste',
    (SELECT least(coalesce(min(budget_number), 0), 0) - 1 FROM public.budgets))
   RETURNING id INTO b;
  UPDATE public.budget_item_templates SET valor_unitario = 123, custo_unitario = 45
   WHERE (categoria_codigo, descricao) IN (
    ('007', 'Operador(a) de Câmera'), ('007', '1º Assistente de Câmera'),
    ('011', 'Edição / Montagem'), ('004', 'Deslocamento'));
  FOREACH porte IN ARRAY ARRAY['grande', 'medio', 'pequeno', 'jogo_rapido'] LOOP
   DELETE FROM public.budget_items WHERE budget_id = b;
   n := public.seed_budget_items(b, porte);
   SELECT count(*) INTO esperados
    FROM public.budget_item_templates t JOIN public.budget_categorias c ON c.codigo = t.categoria_codigo
    WHERE porte = 'grande' OR (porte = 'medio' AND t.no_medio)
     OR (t.categoria_codigo, t.descricao) IN (
      ('007', 'Operador(a) de Câmera'), ('007', '1º Assistente de Câmera'),
      ('011', 'Edição / Montagem'), ('004', 'Deslocamento'));
   IF n <> esperados OR (porte IN ('pequeno','jogo_rapido') AND n <> 4) THEN
    RAISE EXCEPTION 'Itens incorretos no porte %: %', porte, n;
   END IF;
   IF (SELECT count(*) FROM public.budget_items WHERE budget_id = b AND quantity = 1
       AND diaria = 1 AND client_unit_price = 123 AND client_price = 123 AND custo_unitario = 45) <> 4
      OR (SELECT count(*) FROM public.budget_items WHERE budget_id = b AND quantity <> 0) <> 4 THEN
    RAISE EXCEPTION 'Padrões de quantidade/preço/custo incorretos no porte %', porte;
   END IF;
   -- Um segundo carregamento, mesmo de outro porte, preserva edições do usuário.
   UPDATE public.budget_items SET quantity = 3, diaria = 2 WHERE budget_id = b;
   SELECT jsonb_agg(to_jsonb(i) ORDER BY id) INTO antes FROM public.budget_items i WHERE budget_id = b;
   n := public.seed_budget_items(b, 'grande');
   SELECT jsonb_agg(to_jsonb(i) ORDER BY id) INTO depois FROM public.budget_items i WHERE budget_id = b;
   IF n <> 0 OR antes IS DISTINCT FROM depois THEN RAISE EXCEPTION 'Planilha existente alterada'; END IF;
  END LOOP;
  RAISE EXCEPTION 'PORTES_TEST_ROLLBACK';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PORTES_TEST_ROLLBACK' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'Quatro portes, preços, custos e preservação da planilha verificados; testes revertidos';
END $test$;
COMMIT;
