-- "presas" contava TODA notificação não lida sem push — incluindo nível 3,
-- que por desenho nunca vira push (mora só no sino). Isso inflava o número e
-- fazia parecer buraco de entrega onde era comportamento correto.
--
-- Agora conta só o que DEVERIA ter saído e não saiu (nível 1 e 2). É esse o
-- número que denuncia canal morto.
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
  GROUP BY p.id, p.full_name, p.email;

GRANT SELECT ON public.push_alcance TO authenticated;
