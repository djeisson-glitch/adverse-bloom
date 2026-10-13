Use somente PostgreSQL 15 descartável vazio. Execute com ON_ERROR_STOP=1:
1. schema.sql
2. ../../migrations/20261013200000_orcamentos_fechamento.sql
3. ../../migrations/20261013200100_backfill_orcamentos_sicredi.sql
4. check.sql

Cobre retroativo, reutilização, regra de cobrança, estabilidade do número, captura em projeto antigo, deduplicação por projeto, separação das notas, preservação dos totais, snapshot emitido e acesso às RPCs. Schema mínimo não substitui validação de todas as triggers/RLS no Supabase real.
