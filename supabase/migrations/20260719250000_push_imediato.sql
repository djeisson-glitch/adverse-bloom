-- =====================================================================
-- Push IMEDIATO: dispara o envio no instante em que a notificação
-- crítica/importante é criada, em vez de esperar o cron de 2 minutos.
--
--  O cron (*/2) continua como rede de segurança: pega o que o disparo
--  imediato porventura perdeu e faz as re-tentativas. Aqui é só pra tirar o
--  atraso de até 2 min do caso "aba fechada".
--
--  Cuidado com enxurrada: o notificar_prazos cria VÁRIAS notificações numa
--  transação só. Um advisory lock por transação garante que só a PRIMEIRA
--  dispara o push (que já processa TODAS as pendentes de uma vez) — em vez de
--  50 chamadas HTTP. Eventos avulsos (1 alteração do cliente) seguem em
--  transações separadas, então cada um dispara normalmente.
--
--  net.http_post é assíncrono (enfileira e volta na hora), então NÃO segura
--  o INSERT da notificação.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notif_push_imediato()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net AS $$
BEGIN
  IF NEW.prioridade IN ('critico', 'importante') AND NEW.push_em IS NULL THEN
    -- só a 1ª notificação da transação dispara (evita a enxurrada do lote diário)
    IF pg_try_advisory_xact_lock(hashtext('adverse:push-imediato')) THEN
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

DROP TRIGGER IF EXISTS trg_notif_push_imediato ON public.notificacoes;
CREATE TRIGGER trg_notif_push_imediato
  AFTER INSERT ON public.notificacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_push_imediato();
