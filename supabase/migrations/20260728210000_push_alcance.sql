-- =========================================================================
-- Quem o sistema CONSEGUE avisar.
--
-- Medido em 28/07/2026: 1 assinatura de push no sistema inteiro. Robert,
-- José e Maiara com ZERO. O José não recebia nada na área de trabalho não por
-- inconsistência — não existia canal pra ele.
--
-- E ninguém conseguia ver isso: nem ele, nem quem coordena. A auto-cura
-- (sincronizarPush) conserta assinatura PERDIDA, mas nunca pede permissão —
-- de propósito, pra não incomodar. Se a permissão nunca foi concedida, ela
-- desiste em silêncio e o buraco fica invisível pra sempre.
--
-- Esta view é o raio-x: por pessoa, se dá pra alcançar e desde quando.
-- =========================================================================

CREATE OR REPLACE VIEW public.push_alcance AS
  SELECT
    p.id                                    AS user_id,
    COALESCE(p.full_name, p.email, '—')     AS pessoa,
    p.email,
    COUNT(s.id)                             AS dispositivos,
    (COUNT(s.id) > 0)                       AS alcancavel,
    MAX(s.created_at)                       AS assinou_em,
    -- último aviso que o sistema conseguiu empurrar pra essa pessoa
    (SELECT MAX(n.push_em) FROM public.notificacoes n WHERE n.user_id = p.id) AS ultimo_push,
    -- o que está esperando e nunca vai sair enquanto não houver assinatura
    (SELECT COUNT(*) FROM public.notificacoes n
      WHERE n.user_id = p.id AND n.push_em IS NULL AND n.lida_em IS NULL) AS presas
  FROM public.profiles p
  LEFT JOIN public.push_subscriptions s ON s.user_id = p.id
  GROUP BY p.id, p.full_name, p.email;

GRANT SELECT ON public.push_alcance TO authenticated;

COMMENT ON VIEW public.push_alcance IS
  'Raio-x da entrega: quem tem assinatura de push viva, desde quando, e quantos avisos estão presos por falta de canal.';
