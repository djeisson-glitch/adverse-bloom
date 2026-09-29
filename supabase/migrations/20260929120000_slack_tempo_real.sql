-- Slack em tempo real, agrupado por grupo, e o resolvedor do comando /advr.
--
-- Djêisson (29/09): "abri o slack agora e vi diversas notificações, isso é
-- ruim. além disso, é um monte de texto, sem nada muito visual". Medido: 90 das
-- 118 entregas eram prazo_atrasado — os mesmos vencidos reanunciados às 8h, um
-- aviso por item, porque o lote era de 10 e o agrupamento ia por projeto.
--
-- Aqui: nível 2 deixa de esperar 9h/14h/17h e o lote sobe para 60, de modo que
-- a manhã inteira de prazos caiba em UMA mensagem. Quem agrupa é core.ts, que
-- passa a receber 'tipo' e 'grupo'.
--
-- slack_claim partiu da definição VIGENTE (pg_get_functiondef em 29/09).

CREATE OR REPLACE FUNCTION public.slack_claim()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Tempo real para todos os níveis (29/09): quem controla o volume é o
    -- agrupamento por grupo em core.ts, não a espera por horário.
    ORDER BY n.nivel, e.created_at LIMIT 60
  ), claimed AS (
    UPDATE public.slack_entregas e SET status='enviando', claim_token=token, tentativas=e.tentativas+1
    FROM elegiveis WHERE e.id=elegiveis.id RETURNING e.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'user_id',e.user_id,'tentativas',e.tentativas,'slack_target',e.slack_target,'destino',e.destino,
    'titulo',n.titulo,'corpo',n.corpo,'link',n.link,'nivel',n.nivel,'group_key',n.group_key,
    'tipo',n.tipo,'grupo',t.grupo
  ) ORDER BY e.created_at),'[]'::jsonb) INTO items
  FROM claimed e JOIN public.notificacoes n ON n.id=e.notificacao_id
  LEFT JOIN public.notificacao_tipos t ON t.tipo=n.tipo;
  RETURN jsonb_build_object('token',token,'items',items);
END $function$;
