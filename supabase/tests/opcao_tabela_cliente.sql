-- Fixture base + fixture opção + migrações 20261021120000 e 20261021150000.
BEGIN;
SELECT set_config('test.uid','00000000-0000-0000-0000-000000000123',true);
SELECT set_config('test.money','yes',true);
DO $$
DECLARE b uuid:='00000000-0000-0000-0000-000000000001'; d uuid; v uuid; dup uuid; cfg jsonb; sel jsonb; bad jsonb;
 before_b jsonb; before_i jsonb; rejected boolean; stage text; st text; n int;
BEGIN
 INSERT INTO deals(client_id,title) VALUES('d3a96591-55b7-4b64-a445-72aaa28eb950','Existente') RETURNING id INTO d;
 UPDATE budgets SET deal_id=d,entregas='[{"nome":"Vídeo","quantidade":1}]',proposta='{"texto":"Preservar"}',condicoes='{"pagamento":"30 dias"}',recorrente=true,contrato_meses=12 WHERE id=b;
 INSERT INTO budget_items(budget_id,descricao,quantity,diaria,client_unit_price,custo_unitario) VALUES(b,'Equipe original',2,1,300,100);
 SELECT to_jsonb(x) INTO before_b FROM budgets x WHERE id=b;
 SELECT jsonb_agg(to_jsonb(x)) INTO before_i FROM budget_items x WHERE budget_id=b;
 SELECT orcamento_taxas_inclusas INTO cfg FROM client_faturamento LIMIT 1;
 SELECT jsonb_agg(jsonb_build_object('preco_id',id,'quantidade',CASE WHEN e_diaria THEN 0.5 ELSE 1 END,'preco_unitario',preco)) INTO sel FROM client_precos WHERE tipo IN ('Pílula','Captação');
 v:=orcamento_criar_opcao_tabela(b,'Tabela',cfg,sel);
 ASSERT (SELECT to_jsonb(x)=before_b FROM budgets x WHERE id=b), 'original modificado';
 ASSERT (SELECT jsonb_agg(to_jsonb(x))=before_i FROM budget_items x WHERE budget_id=b), 'itens originais modificados';
 ASSERT (SELECT parent_budget_id=b AND precos_finais AND total_value=1410.85 AND status='draft' AND aprovada_em IS NULL AND aprovacoes='[]'::jsonb AND recorrente AND contrato_meses=12 AND entregas=before_b->'entregas' AND proposta=before_b->'proposta' AND condicoes=before_b->'condicoes' FROM budgets WHERE id=v), 'alternativa incorreta';
 ASSERT (SELECT count(*)=5 AND bool_and(custo_unitario=0) FROM budget_items WHERE budget_id=v), 'catálogo ou custos incorretos';
 dup:=orcamento_criar_variante(v,'Duplicada');
 ASSERT (SELECT precos_finais AND parent_budget_id=b AND total_value=1410.85 FROM budgets WHERE id=dup), 'modo da alternativa perdido ao duplicar';
 FOREACH st IN ARRAY ARRAY['aceite','ganho','fechamento','fechado_ganho','perdido'] LOOP
  UPDATE deals SET stage=st WHERE id=d;
  rejected:=false;
  BEGIN PERFORM orcamento_criar_opcao_tabela(b,'Não criar',cfg,sel); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
  ASSERT rejected, 'negócio encerrado aceito';
 END LOOP;
 UPDATE deals SET stage='lead' WHERE id=d;
 FOREACH st IN ARRAY ARRAY['approved','rejected'] LOOP
  UPDATE budgets SET status=st WHERE id=b;rejected:=false;
  BEGIN PERFORM orcamento_criar_opcao_tabela(b,'Não criar',cfg,sel); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
  ASSERT rejected, 'status protegido aceito';
 END LOOP;
 UPDATE budgets SET status='draft',aprovacoes='[{"tipo":"aprovacao"}]' WHERE id=b;rejected:=false;
 BEGIN PERFORM orcamento_criar_opcao_tabela(b,'Não criar',cfg,sel); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 ASSERT rejected, 'aprovação histórica ignorada';
 UPDATE budgets SET aprovacoes='[]',aprovada_em=now() WHERE id=b;rejected:=false;
 BEGIN PERFORM orcamento_criar_opcao_tabela(b,'Não criar',cfg,sel); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 ASSERT rejected, 'aprovação ignorada';
 UPDATE budgets SET aprovada_em=null,fechamento_mes='2026-10-01' WHERE id=b;rejected:=false;
 BEGIN PERFORM orcamento_criar_opcao_tabela(b,'Não criar',cfg,sel); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 ASSERT rejected, 'mensal aceito';
 UPDATE budgets SET fechamento_mes=null WHERE id=b;
 rejected:=false;
 BEGIN PERFORM orcamento_criar_opcao_tabela(b,'Não criar','{}',sel); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 ASSERT rejected, 'taxas desatualizadas aceitas';
 FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array('[]'::jsonb,sel||sel,jsonb_set(sel,'{0,preco_unitario}','1'),jsonb_set(sel,'{0,quantidade}','-1'))) LOOP
  rejected:=false;
  BEGIN PERFORM orcamento_criar_opcao_tabela(b,'Não criar',cfg,bad); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
  ASSERT rejected, 'seleção inválida aceita';
 END LOOP;
 SELECT jsonb_build_array(jsonb_build_object('preco_id',id,'quantidade',0.5,'preco_unitario',preco)) INTO bad FROM client_precos WHERE tipo='Pílula';rejected:=false;
 BEGIN PERFORM orcamento_criar_opcao_tabela(b,'Não criar',cfg,bad); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 ASSERT rejected, 'fração de vídeo aceita';
 PERFORM set_config('test.money','no',true);rejected:=false;
 BEGIN PERFORM orcamento_criar_opcao_tabela(b,'Não criar',cfg,sel); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 ASSERT rejected, 'permissão ignorada';
 PERFORM set_config('test.money','yes',true);PERFORM set_config('test.uid','',true);rejected:=false;
 BEGIN PERFORM orcamento_criar_opcao_tabela(b,'Não criar',cfg,sel); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 ASSERT rejected, 'anônimo aceito';
 ASSERT (SELECT count(*)=3 FROM budgets), 'falha deixou cópias parciais';
 RAISE NOTICE 'OK: original intacto, nova opção, duplicação, aprovação, mensal, concorrência de preços, quantidades e permissões';
END $$;
ROLLBACK;
