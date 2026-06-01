-- ============================================================================
-- Endurecimento p/ produção + sync automático (2026-06-01, migração p/ Supabase próprio)
-- ============================================================================

-- 1) memories estava SEM RLS (herdado da origem). Habilita + dono gerencia as suas.
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own memories" ON public.memories;
CREATE POLICY "Users manage own memories" ON public.memories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2) VAZAMENTO DE TOKEN: a policy de SELECT do cache era `using (true)`, então
-- qualquer usuário autenticado lia a linha `auth_tokens` (access/refresh token
-- da Conta Azul) pelo browser. O front só consome accounts/categories/payables/
-- receivables/sales — nunca auth_tokens. Restringe a leitura do cliente p/
-- excluir os tokens (service_role/edge functions seguem lendo, pois ignoram RLS).
DROP POLICY IF EXISTS "Authenticated users can view cache" ON public.conta_azul_cache;
CREATE POLICY "Authenticated users can view cache" ON public.conta_azul_cache
  FOR SELECT TO authenticated USING (data_type <> 'auth_tokens');

-- 3) Sync automático da Conta Azul a cada 6h (hoje era manual).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('conta-azul-sync-6h');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job ainda não existe
END $$;

SELECT cron.schedule(
  'conta-azul-sync-6h',
  '0 */6 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://ythmkxudzaoaayxxlgqy.supabase.co/functions/v1/conta-azul-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aG1reHVkemFvYWF5eHhsZ3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0MjAsImV4cCI6MjA5NTg4OTQyMH0.Iww1k1QUKqD1EUqi1d8CLSl0Erd_6VHkk3KWKaMowNI',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aG1reHVkemFvYWF5eHhsZ3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0MjAsImV4cCI6MjA5NTg4OTQyMH0.Iww1k1QUKqD1EUqi1d8CLSl0Erd_6VHkk3KWKaMowNI'
    ),
    body := '{}'::jsonb
  );
  $job$
);
