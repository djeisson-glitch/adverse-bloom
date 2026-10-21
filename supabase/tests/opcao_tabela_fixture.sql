-- Complementa orcamentos_tabela_fixture.sql, apenas em PostgreSQL descartável.
ALTER TABLE deals ADD COLUMN stage text DEFAULT 'lead';
ALTER TABLE budgets ADD COLUMN aprovada_em timestamptz, ADD COLUMN aprovacoes jsonb DEFAULT '[]', ADD COLUMN recorrente boolean DEFAULT false, ADD COLUMN contrato_meses int;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION pode_ver_dinheiro(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.money',true),'yes')='yes' $$;
