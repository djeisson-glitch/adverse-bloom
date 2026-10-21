-- Executar após fixture + migration + função orcamento_criar_variante num banco descartável.
BEGIN;
DO $$
DECLARE b uuid; d uuid; v uuid; antigo uuid; x record; tok uuid; j jsonb; cat uuid;
BEGIN
 ASSERT NOT (SELECT precos_finais FROM budgets WHERE project_name='Antigo');
 ASSERT (SELECT total_value=999 AND margem_produtora_percent=40 FROM budgets WHERE project_name='Antigo');
 ASSERT (SELECT imposto_percent=0 AND margem_percent=0 FROM client_faturamento LIMIT 1), 'fechamento mensal alterado';
 INSERT INTO deals(client_id,title) VALUES('d3a96591-55b7-4b64-a445-72aaa28eb950','Novo') RETURNING id INTO d;
 INSERT INTO budgets(deal_id,project_name,margem_produtora_percent,imposto_percent) VALUES(d,'Novo',40,12) RETURNING id INTO b;
 SELECT * INTO x FROM budgets WHERE id=b;
 ASSERT x.precos_finais AND x.margem_produtora_percent=37.68 AND x.imposto_percent=12 AND x.comissoes->0->>'valor'='4';
 ASSERT (SELECT count(*)=5 AND bool_and(quantity=0 AND diaria=1) FROM budget_items WHERE budget_id=b), 'catálogo cobrado sem escolha';
 ASSERT (SELECT client_unit_price=446.6 FROM budget_items WHERE budget_id=b AND descricao='Pílula');
 ASSERT public.seed_budget_items(b,'pequeno')=0;
 UPDATE budget_items SET quantity=1 WHERE budget_id=b AND descricao='Pílula';
 ASSERT (SELECT total_value=446.6 FROM budgets WHERE id=b), 'preço arredondado ou taxas somadas por fora';
 INSERT INTO budget_shares(budget_id,mostrar) VALUES(b,'{"valores":true,"custos":true,"rentabilidade":true,"comissoes":true,"impostos":true}') RETURNING token INTO tok;
 j:=public.orcamento_compartilhado(tok);
 ASSERT j->'totais'->>'custo_producao'='206.87', j::text;
 ASSERT (j->'totais'->>'total')::numeric=446.6;
 ASSERT (j->'totais'->>'arredondamento')::numeric=0;
 ASSERT jsonb_array_length(j->'itens')=1, 'serviços não contratados expostos';
 UPDATE budget_items SET client_unit_price=500,quantity=3 WHERE budget_id=b AND descricao='Pílula';
 ASSERT public.seed_budget_items(b)=0;
 ASSERT (SELECT total_value=1500 FROM budgets WHERE id=b);
 UPDATE client_precos SET preco=9999 WHERE tipo='Pílula';
 ASSERT (SELECT client_unit_price=500 FROM budget_items WHERE budget_id=b AND descricao='Pílula'), 'snapshot sobrescrito';
 v:=public.orcamento_criar_variante(b,'Opção B');
 ASSERT (SELECT precos_finais AND margem_produtora_percent=37.68 AND total_value=1500 FROM budgets WHERE id=v);
 ASSERT (SELECT count(*)=5 FROM budget_items WHERE budget_id=v), 'variante duplicou itens';
 v:=public.orcamento_criar_variante(v,'Opção C');
 ASSERT (SELECT precos_finais AND total_value=1500 FROM budgets WHERE id=v);
 SELECT categoria_id INTO cat FROM budget_items WHERE budget_id=b AND descricao='Pílula';
 UPDATE budgets SET categorias_ocultas=jsonb_build_array(cat) WHERE id=b;
 ASSERT (SELECT total_value=0 FROM budgets WHERE id=b);
 j:=public.orcamento_compartilhado(tok);
 ASSERT (j->'totais'->>'total')::numeric=0 AND jsonb_array_length(j->'itens')=0;
 UPDATE budgets SET categorias_ocultas='[]',margem_produtora_percent=20 WHERE id=b;
 ASSERT (SELECT total_value=1500 FROM budgets WHERE id=b), 'alterar taxa alterou preço final';
 UPDATE budget_shares SET mostrar='{"valores":true}' WHERE token=tok;
 j:=public.orcamento_compartilhado(tok);
 ASSERT j->'totais'->>'margem_valor' IS NULL AND j->'totais'->>'imposto_valor' IS NULL AND j->>'comissoes' IS NULL, 'visibilidade ignorada';
 -- Outros clientes continuam usando os modelos e percentuais usuais.
 INSERT INTO deals(client_id,title) VALUES('e5e9dee9-9a19-4eae-b49e-8fb14f3390c8','Outro') RETURNING id INTO d;
 INSERT INTO budgets(deal_id,project_name,margem_produtora_percent) VALUES(d,'Outro',40) RETURNING id INTO antigo;
 ASSERT NOT (SELECT precos_finais FROM budgets WHERE id=antigo);
 ASSERT public.seed_budget_items(antigo,'pequeno')=4;
 v:=public.orcamento_criar_variante('00000000-0000-0000-0000-000000000001','Antigo B');
 ASSERT NOT (SELECT precos_finais FROM budgets WHERE id=v), 'variante antiga foi convertida';
 -- Fechamentos mensais nunca recebem o catálogo.
 INSERT INTO budgets(client_id,fechamento_mes,project_name,total_value) VALUES('d3a96591-55b7-4b64-a445-72aaa28eb950','2026-10-01','Mensal',1234) RETURNING id INTO v;
 ASSERT NOT (SELECT precos_finais FROM budgets WHERE id=v);
 ASSERT (SELECT total_value=1234 FROM budgets WHERE id=v);
 RAISE NOTICE 'OK: tabela, parcelas, edição, snapshot, variantes, visibilidade, grupos ocultos, históricos e mensal';
END $$;
ROLLBACK;
