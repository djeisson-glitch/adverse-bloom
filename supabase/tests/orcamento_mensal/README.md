Executar somente em PostgreSQL 15 descartável vazio, com ON_ERROR_STOP=1:

1. ../orcamentos_fechamento/schema.sql
2. ../../migrations/20261013200000_orcamentos_fechamento.sql
3. seed.sql
4. ../../migrations/20261014140000_orcamento_mensal_unico.sql
5. check.sql

Verifica mensal sem orçamento individual, referência por cliente/mês, projeto misto, custos pendentes/zero, regeneração sem perda, revisão concorrente, exclusão/reativação de projetos, rejeição de valores negativos/duplicados/projetos externos, fatura idempotente, mês sem projetos, snapshots emitidos e permissões. Fixture reduzida: produção também possui outras triggers, views e RLS.
