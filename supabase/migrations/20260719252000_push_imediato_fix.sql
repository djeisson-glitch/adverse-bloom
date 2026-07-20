-- Correção do guard: advisory lock é REENTRANTE na mesma transação (o dono
-- readquire sem bloquear), então disparava uma vez por linha. O certo pra
-- "só a 1ª da transação" é uma flag transaction-local (set_config is_local=true),
-- que zera sozinha no commit/rollback.
CREATE OR REPLACE FUNCTION public.tg_notif_push_imediato()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net AS $$
BEGIN
  IF NEW.prioridade IN ('critico', 'importante') AND NEW.push_em IS NULL THEN
    IF current_setting('adverse.push_fired', true) IS DISTINCT FROM 'true' THEN
      PERFORM set_config('adverse.push_fired', 'true', true);  -- true = só nesta transação
      PERFORM net.http_post(
        url := 'https://ythmkxudzaoaayxxlgqy.supabase.co/functions/v1/push-enviar',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aG1reHVkemFvYWF5eHhsZ3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0MjAsImV4cCI6MjA5NTg4OTQyMH0.Iww1k1QUKqD1EUqi1d8CLSl0Erd_6VHkk3KWKaMowNI',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aG1reHVkemFvYWF5eHhsZ3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0MjAsImV4cCI6MjA5NTg4OTQyMH0.Iww1k1QUKqD1EUqi1d8CLSl0Erd_6VHkk3KWKaMowNI'
        ),
        body := '{}'::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;
