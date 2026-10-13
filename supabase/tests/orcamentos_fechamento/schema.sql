-- Apenas banco descartável vazio.
CREATE SCHEMA auth;
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; END $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION pode_ver_dinheiro() RETURNS bool LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.money',true),'false')::bool $$;
CREATE FUNCTION has_role(uuid,text) RETURNS bool LANGUAGE sql AS $$ SELECT pode_ver_dinheiro() $$;
CREATE TABLE clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text);
CREATE TABLE deals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid);
CREATE SEQUENCE budget_number_seq START 1000;
CREATE TABLE budgets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_name text,client_name text,client_id uuid,deal_id uuid,parent_budget_id uuid,is_latest_version bool DEFAULT true,budget_number int DEFAULT nextval('budget_number_seq'),status text,markup_percent numeric,tax_percent numeric,bv_percent numeric,commission_percent numeric,margem_produtora_percent numeric,imposto_percent numeric,total_value numeric,proposta jsonb,notas text);
CREATE UNIQUE INDEX budget_numero ON budgets(budget_number);
CREATE TABLE projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,name text,numero text,budget_id uuid REFERENCES budgets(id),deal_id uuid,faturamento text DEFAULT 'mensal',criado_em timestamptz,created_at timestamptz DEFAULT now(),valor_fechamento numeric);
CREATE TABLE client_faturamento(client_id uuid PRIMARY KEY,modelo text,valor_hora numeric,margem_percent numeric,imposto_percent numeric);
CREATE TABLE deliverables(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,titulo text,status text DEFAULT 'em_edicao',faturamento text,created_at timestamptz DEFAULT now());
CREATE VIEW deliverables_criacao AS SELECT d.id,coalesce(p.criado_em,p.created_at,d.created_at) AS criacao_efetiva FROM deliverables d JOIN projects p ON p.id=d.project_id;
CREATE VIEW deliverables_faturamento AS SELECT d.id,coalesce(d.faturamento,p.faturamento,'mensal') AS faturamento_efetivo FROM deliverables d JOIN projects p ON p.id=d.project_id;
CREATE TABLE time_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,deliverable_id uuid,billable bool DEFAULT true);
CREATE TABLE producao_saidas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,tipo text DEFAULT 'diaria',status text DEFAULT 'agendada',data date);
CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,descricao text,valor numeric,data_emissao date,status text,created_by uuid);
CREATE TABLE faturamento_mensal(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,ref_mes date,modelo text,total numeric,detalhe jsonb,status text DEFAULT 'rascunho',invoice_id uuid);
CREATE FUNCTION contrato_excedente(uuid,date,date) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"valor":0}'::jsonb $$;
-- Retroativo: duas contas Sicredi, um orçamento existente e um projeto antigo sem vínculo.
INSERT INTO clients VALUES ('d3a96591-55b7-4b64-a445-72aaa28eb950','Sicredi Horas'),('e5e9dee9-9a19-4eae-b49e-8fb14f3390c8','Sicredi Tabela');
INSERT INTO client_faturamento VALUES ('d3a96591-55b7-4b64-a445-72aaa28eb950','horas',100,40,12),('e5e9dee9-9a19-4eae-b49e-8fb14f3390c8','tabela',null,0,0);
INSERT INTO budgets(id,budget_number,client_id,total_value) VALUES ('30000000-0000-0000-0000-000000000001',313,'d3a96591-55b7-4b64-a445-72aaa28eb950',1650);
INSERT INTO projects(id,client_id,name,budget_id,criado_em) VALUES ('20000000-0000-0000-0000-000000000001','d3a96591-55b7-4b64-a445-72aaa28eb950','Existente','30000000-0000-0000-0000-000000000001','2026-07-01'),('20000000-0000-0000-0000-000000000002','e5e9dee9-9a19-4eae-b49e-8fb14f3390c8','Antigo',null,'2026-01-01');
INSERT INTO producao_saidas(project_id,data) VALUES ('20000000-0000-0000-0000-000000000002','2026-07-15');
INSERT INTO faturamento_mensal(client_id,ref_mes,modelo,total,detalhe,status) VALUES ('e5e9dee9-9a19-4eae-b49e-8fb14f3390c8','2026-07-01','tabela',1928.50,'{"itens":[{"valor":1928.50}]}','faturado');
