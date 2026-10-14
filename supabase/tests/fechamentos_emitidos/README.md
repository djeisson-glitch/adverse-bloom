Somente PostgreSQL 15 descartável, ON_ERROR_STOP=1. Não executar fixtures em produção.

Ordem: ../orcamentos_fechamento/schema.sql → migration 20261013200000 → ../orcamento_mensal/seed.sql → migration 20261014140000 → ../orcamento_mensal/check.sql → seed.sql → migration 20261014150000 → check.sql.

Cobre preservação integral de notas/snapshots, consolidação do faturado/enviado, nomes e enquadramento originais em vez de dados atuais, exclusão de avulsos, idempotência, custo persistido e referência enviada preservada ao faturar.
