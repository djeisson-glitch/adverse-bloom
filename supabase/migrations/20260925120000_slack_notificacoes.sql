-- Slack is an independent delivery channel. Never consumes push_em or lida_em.
-- Starts disabled, with no historical backfill.
CREATE TABLE public.slack_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  channel_id text CHECK (channel_id ~ '^[CG][A-Z0-9]{8,}$'),
  channel_nome text,
  worker_token uuid,
  worker_until timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO public.slack_config(id) VALUES (true);
CREATE TABLE public.slack_pessoas (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slack_user_id text NOT NULL UNIQUE CHECK (slack_user_id ~ '^[UW][A-Z0-9]{8,}$'),
  slack_nome text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE public.slack_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacao_id uuid NOT NULL REFERENCES public.notificacoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destino text NOT NULL CHECK (destino IN ('direta','canal')),
  slack_target text NOT NULL,
  event_key text NOT NULL,
  UNIQUE(destino, event_key),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviando','enviada','falhou','cancelada')),
  tentativas int NOT NULL DEFAULT 0,
  proxima_em timestamptz NOT NULL DEFAULT now(),
  claim_token uuid,
  erro text,
  slack_ts text,
  enviada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX slack_entregas_fila ON public.slack_entregas(status, proxima_em);
ALTER TABLE public.slack_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_entregas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.slack_config, public.slack_pessoas, public.slack_entregas FROM anon, authenticated;
GRANT SELECT ON public.slack_pessoas, public.slack_entregas TO authenticated;
GRANT ALL ON public.slack_config, public.slack_pessoas, public.slack_entregas TO service_role;
CREATE POLICY slack_pessoas_admin ON public.slack_pessoas FOR SELECT TO authenticated USING (public.pode_admin_notif(auth.uid()));
CREATE POLICY slack_entregas_admin ON public.slack_entregas FOR SELECT TO authenticated USING (public.pode_admin_notif(auth.uid()));

CREATE FUNCTION public.slack_enfileirar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.lida_em IS NULL AND public.pode_push(NEW.user_id, NEW.tipo, NEW.nivel)
    AND EXISTS (SELECT 1 FROM public.slack_config WHERE id AND enabled)
  THEN
    INSERT INTO public.slack_entregas(notificacao_id,user_id,destino,slack_target,event_key)
      SELECT NEW.id, NEW.user_id, 'direta', p.slack_user_id, NEW.id::text
      FROM public.slack_pessoas p WHERE p.user_id=NEW.user_id AND p.enabled
      ON CONFLICT (destino,event_key) DO NOTHING;
    -- Shared channel receives operational events only. Commercial / personal
    -- digests remain private. Repeated recipients of one event share one entry.
    IF EXISTS (SELECT 1 FROM public.notificacao_tipos WHERE tipo=NEW.tipo AND grupo IN ('producao','prazos','conversas')) THEN
      INSERT INTO public.slack_entregas(notificacao_id,user_id,destino,slack_target,event_key)
        SELECT NEW.id,NEW.user_id,'canal',c.channel_id,
          md5(jsonb_build_array(coalesce(NEW.dedupe_key,NEW.id::text),NEW.titulo,NEW.corpo,NEW.link,NEW.created_at)::text)
        FROM public.slack_config c WHERE c.id AND c.channel_id IS NOT NULL
        ON CONFLICT (destino,event_key) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_slack_enfileirar AFTER INSERT ON public.notificacoes
FOR EACH ROW EXECUTE FUNCTION public.slack_enfileirar();

-- One leased worker for the workspace prevents concurrent batches and DM floods.
CREATE FUNCTION public.slack_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE token uuid := gen_random_uuid(); items jsonb;
BEGIN
  UPDATE public.slack_config SET worker_token = token, worker_until = now() + interval '5 minutes'
    WHERE id AND enabled AND worker_until < now();
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.slack_entregas SET status = CASE WHEN tentativas >= 8 THEN 'falhou' ELSE 'pendente' END,
    erro = 'envio_interrompido', claim_token = NULL WHERE status = 'enviando';
  UPDATE public.slack_entregas e SET status = 'cancelada', erro = 'lida_ou_desativada'
    FROM public.notificacoes n
    WHERE e.notificacao_id = n.id AND e.status = 'pendente'
      AND (n.lida_em IS NOT NULL OR NOT public.pode_push(n.user_id,n.tipo,n.nivel)
        OR (e.destino='direta' AND NOT EXISTS (SELECT 1 FROM public.slack_pessoas p WHERE p.user_id=e.user_id AND p.enabled AND p.slack_user_id=e.slack_target))
        OR (e.destino='canal' AND NOT EXISTS (SELECT 1 FROM public.slack_config c WHERE c.id AND c.channel_id=e.slack_target))
        OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=e.user_id AND coalesce(p.ativo,true)));

  WITH elegiveis AS (
    SELECT e.id FROM public.slack_entregas e JOIN public.notificacoes n ON n.id=e.notificacao_id
    WHERE e.status='pendente' AND e.proxima_em <= now()
      AND (n.nivel=1 OR (n.nivel=2 AND (e.tentativas > 0 OR
        extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo')::int = ANY(public.notif_horas_resumo()))))
    ORDER BY n.nivel, e.created_at LIMIT 10
  ), claimed AS (
    UPDATE public.slack_entregas e SET status='enviando', claim_token=token, tentativas=e.tentativas+1
    FROM elegiveis WHERE e.id=elegiveis.id RETURNING e.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'user_id',e.user_id,'tentativas',e.tentativas,'slack_target',e.slack_target,'destino',e.destino,
    'titulo',n.titulo,'corpo',n.corpo,'link',n.link,'nivel',n.nivel,'group_key',n.group_key
  ) ORDER BY e.created_at),'[]'::jsonb) INTO items
  FROM claimed e JOIN public.notificacoes n ON n.id=e.notificacao_id;
  RETURN jsonb_build_object('token',token,'items',items);
END $$;

CREATE FUNCTION public.slack_concluir(_token uuid, _ids uuid[], _erro text DEFAULT NULL,
  _ts text DEFAULT NULL, _retry_seconds int DEFAULT 60, _permanente boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.slack_entregas SET
    status = CASE WHEN _erro IS NULL THEN 'enviada' WHEN _permanente OR tentativas >= 8 THEN 'falhou' ELSE 'pendente' END,
    erro = left(_erro,160), slack_ts=_ts,
    enviada_em=CASE WHEN _erro IS NULL THEN now() ELSE NULL END,
    proxima_em=now()+make_interval(secs=>greatest(1,least(_retry_seconds,86400))), claim_token=NULL
  WHERE id=ANY(_ids) AND claim_token=_token AND status='enviando';
END $$;
CREATE FUNCTION public.slack_liberar(_token uuid, _pausa int DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- Any items not attempted (e.g. workspace rate limit) go back without losing a try.
  UPDATE public.slack_entregas SET status='pendente',claim_token=NULL,tentativas=greatest(0,tentativas-1)
    WHERE claim_token=_token AND status='enviando';
  UPDATE public.slack_config SET worker_token=NULL,
    worker_until=now()+make_interval(secs=>greatest(0,least(_pausa,86400))) WHERE worker_token=_token;
END $$;
REVOKE ALL ON FUNCTION public.slack_enfileirar(), public.slack_claim(), public.slack_concluir(uuid,uuid[],text,text,int,boolean), public.slack_liberar(uuid,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.slack_claim(), public.slack_concluir(uuid,uuid[],text,text,int,boolean), public.slack_liberar(uuid,int) TO service_role;

-- Secret lives in Vault and Edge secrets, never in migrations or the browser.
-- Without configuration this cron is a no-op. A cron failure cannot break production writes.
SELECT cron.schedule('slack-notificacoes','* * * * *', $job$
  SELECT net.http_post(
    url := 'https://ythmkxudzaoaayxxlgqy.supabase.co/functions/v1/slack-notificacoes',
    headers := jsonb_build_object('Content-Type','application/json','x-slack-worker-secret',s.decrypted_secret),
    body := '{"action":"dispatch"}'::jsonb, timeout_milliseconds := 120000
  ) FROM vault.decrypted_secrets s
    WHERE s.name='slack_worker_secret'
      AND EXISTS (SELECT 1 FROM public.slack_config WHERE id AND enabled)
  LIMIT 1;
$job$);
