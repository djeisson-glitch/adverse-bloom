-- Apenas fixture em banco descartável. Reproduz snapshots anteriores à consolidação.
INSERT INTO projects(id,client_id,name,budget_id,criado_em,faturamento) VALUES
 ('25000000-0000-0000-0000-000000000001','d3a96591-55b7-4b64-a445-72aaa28eb950','Projeto histórico A','30000000-0000-0000-0000-000000000001','2026-08-01','avulso'),
 ('25000000-0000-0000-0000-000000000002','d3a96591-55b7-4b64-a445-72aaa28eb950','Projeto histórico B','30000000-0000-0000-0000-000000000001','2026-08-01','mensal');
INSERT INTO invoices(id,client_id,descricao,valor) VALUES('45000000-0000-0000-0000-000000000001','d3a96591-55b7-4b64-a445-72aaa28eb950','Referência original #0313',2902.90);
ALTER TABLE faturamento_mensal DISABLE TRIGGER trg_fechamento_orcamentos;
INSERT INTO faturamento_mensal(id,client_id,ref_mes,modelo,total,detalhe,status,invoice_id,referencias_emitidas) VALUES
 ('55000000-0000-0000-0000-000000000001','d3a96591-55b7-4b64-a445-72aaa28eb950','2026-08-01','tabela',2902.90,
 '{"itens":[{"valor":2902.90}],"orcamentos_projetos":[{"project_id":"25000000-0000-0000-0000-000000000001","projeto":"Nome no fechamento","budget_id":"30000000-0000-0000-0000-000000000001","orcamento_numero":313,"baldes":["mensal"]},{"project_id":"25000000-0000-0000-0000-000000000002","projeto":"Projeto fora do fee","budget_id":"30000000-0000-0000-0000-000000000001","orcamento_numero":313,"baldes":["avulso"]}]}',
 'faturado','45000000-0000-0000-0000-000000000001',true),
 ('55000000-0000-0000-0000-000000000002','d3a96591-55b7-4b64-a445-72aaa28eb950','2026-09-01','horas',100,
 '{"orcamentos_projetos":[{"project_id":"25000000-0000-0000-0000-000000000001","projeto":"Nome no fechamento","budget_id":"30000000-0000-0000-0000-000000000001","orcamento_numero":313,"baldes":["mensal"]}]}', 'enviado',null,true);
ALTER TABLE faturamento_mensal ENABLE TRIGGER trg_fechamento_orcamentos;
CREATE TABLE teste_emitidos_antes AS SELECT id,to_jsonb(f) AS dados FROM faturamento_mensal f;
CREATE TABLE teste_invoices_antes AS SELECT * FROM invoices;
