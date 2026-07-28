-- Dois defeitos da push_alcance:
--
-- 1) View sem security_invoker roda como dono e IGNORA a RLS — qualquer pessoa
--    autenticada via o e-mail e o estado de entrega do time inteiro. Não é o
--    fim do mundo, mas não era pra ser assim: cada um vê a sua, a gestão vê
--    todas. Mesmo desenho do horas_rodando_agora().
--
-- 2) Sem filtro, o painel de diagnóstico pedia .maybeSingle() sobre 5 linhas e
--    recebia nada — por isso "último aviso entregue: nunca" pra quem tinha
--    recebido push hoje.
CREATE OR REPLACE VIEW public.push_alcance AS
  SELECT
    p.id                                    AS user_id,
    COALESCE(p.full_name, p.email, '—')     AS pessoa,
    p.email,
    COUNT(s.id)                             AS dispositivos,
    (COUNT(s.id) > 0)                       AS alcancavel,
    MAX(s.created_at)                       AS assinou_em,
    (SELECT MAX(n.push_em) FROM public.notificacoes n WHERE n.user_id = p.id) AS ultimo_push,
    (SELECT COUNT(*) FROM public.notificacoes n
      WHERE n.user_id = p.id AND n.push_em IS NULL AND n.lida_em IS NULL
        AND COALESCE(n.nivel, 3) <= 2) AS presas
  FROM public.profiles p
  LEFT JOIN public.push_subscriptions s ON s.user_id = p.id
  WHERE p.id = auth.uid() OR public.pode_admin_notif(auth.uid())
  GROUP BY p.id, p.full_name, p.email;

GRANT SELECT ON public.push_alcance TO authenticated;
