Teste de integração em PostgreSQL 15 vazio e descartável. Nunca rode schema.sql em um banco existente.

Execute com ON_ERROR_STOP=1, nesta ordem: schema.sql, migrations/20261013210000_painel_contrato_cliente.sql, check.sql.
O schema mínimo simula as tabelas/views existentes; valida SQL, cálculo, vigência, deduplicação, classificação e gates de permissão. Não substitui a validação de RLS e das demais migrations no ambiente Supabase.
