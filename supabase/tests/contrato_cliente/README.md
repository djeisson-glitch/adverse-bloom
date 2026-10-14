Teste de integração em PostgreSQL 15 vazio e descartável. Nunca rode schema.sql em um banco existente.

Execute com ON_ERROR_STOP=1, nesta ordem: schema.sql, migrations/20261013210000_painel_contrato_cliente.sql, check.sql.
O schema mínimo simula as tabelas/views existentes; valida SQL, cálculo, vigência, deduplicação, classificação e gates de permissão. Não substitui a validação de RLS e das demais migrations no ambiente Supabase.

Para testar a prioridade do projeto, use um banco vazio e execute schema.sql, depois as migrations
20261013210000, 20261013230000, 20261014000000, 20261014020000 e 20261014120000 (nessa ordem).
Execute projeto_faturamento.sql, ignorar.sql e execucao.sql. Os testes usam transações com rollback.
Validam projetos mensais/avulsos/nota separada, overrides legados, retorno ao mensal,
peças novas e transferidas, metadados de agrupamento e a preservação de security_invoker.
