-- Limpa os 5 clientes criados pela tentativa de importação que falhou no
-- primeiro lote (antes de registrar o run) — ficaram órfãos, fora da apólice
-- de reversão. Guarded: só apaga se NÃO tiverem nenhum projeto/negócio.
DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.clients c
   WHERE c.name IN ('Sicredi Região', 'SLC Máquinas', 'SLC Cruz Alta', 'FO Rural', 'Unimed')
     AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.client_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.client_id = c.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'clientes órfãos removidos: %', n;
END $$;
