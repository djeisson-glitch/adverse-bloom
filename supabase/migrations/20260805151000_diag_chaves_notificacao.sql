-- =========================================================================
-- Medição que provou a causa (só lê e imprime; não altera nada)
--
-- Resultado em produção, 05/08/2026:
--
--   aprov1   → 42 notificações | 42 com chave TRAVADA | 0 com rodada
--   aprov2   → 19              | 19 travadas         | 0
--   aprovado →  4              |  4 travadas         | 0
--   ajuste   → 13              |  0 travadas         | 13
--   atrib    → 93              |  0 travadas         | 93
--
-- Chave "travada" = `prefixo:<id>` sem discriminador de rodada: a segunda ida
-- ao mesmo estado é descartada pelo ON CONFLICT DO NOTHING do notificar().
--
-- Exatamente as notificações de REVISÃO estavam travadas, e as de ajuste do
-- cliente não — que é por que algumas chegavam e outras não, sem padrão
-- aparente. Fica no histórico porque a próxima suspeita de "notificação não
-- chega" começa perguntando isto.
-- =========================================================================

DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '--- notificações de revisão por peça (chave antiga = 1 por peça pra sempre) ---';
  FOR r IN
    SELECT split_part(dedupe_key, ':', 1) AS prefixo,
           count(*) AS total,
           count(*) FILTER (WHERE array_length(string_to_array(dedupe_key, ':'), 1) = 2) AS chave_antiga,
           count(*) FILTER (WHERE array_length(string_to_array(dedupe_key, ':'), 1) >= 3) AS chave_com_rodada
      FROM public.notificacoes
     WHERE dedupe_key LIKE 'aprov%' OR dedupe_key LIKE 'atrib%' OR dedupe_key LIKE 'ajuste%'
     GROUP BY 1 ORDER BY 1
  LOOP
    RAISE NOTICE '% → % total | % com chave antiga (travada) | % com rodada',
      rpad(r.prefixo, 12), r.total, r.chave_antiga, r.chave_com_rodada;
  END LOOP;
END $$;
