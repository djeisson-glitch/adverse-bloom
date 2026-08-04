-- =========================================================================
-- String vazia não é foto
--
-- O backfill disse "5 de 6 com foto, só a Maiara sem", mas a tela mostrava
-- DUAS pessoas com iniciais. A conta não fechava porque `avatar_url = ''`
-- passa em `IS NOT NULL` e não passa em `foto && <img>` no React: no banco
-- conta como preenchido, na tela é vazio. Toda checagem futura de "quem está
-- sem foto" ia mentir do mesmo jeito.
--
-- Normaliza vazio pra NULL — que é o que ele significa — e mostra o que cada
-- um tem no metadata do Google, pra saber quem realmente não tem foto lá e
-- quem só não teve o valor copiado.
-- =========================================================================

UPDATE public.profiles
   SET avatar_url = NULL
 WHERE avatar_url IS NOT NULL AND btrim(avatar_url) = '';

-- Agora que vazio virou NULL, o backfill do 20260804050000 tem o que fazer.
UPDATE public.profiles p
   SET avatar_url = coalesce(
         u.raw_user_meta_data->>'avatar_url',
         u.raw_user_meta_data->>'picture'
       )
  FROM auth.users u
 WHERE u.id = p.id
   AND p.avatar_url IS NULL
   AND coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture') IS NOT NULL;

DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '--- foto por pessoa (profiles x metadata do Google) ---';
  FOR r IN
    SELECT coalesce(p.full_name, p.email) AS quem,
           (p.avatar_url IS NOT NULL)     AS tem_no_perfil,
           (coalesce(u.raw_user_meta_data->>'avatar_url',
                     u.raw_user_meta_data->>'picture') IS NOT NULL) AS tem_no_google,
           coalesce(u.last_sign_in_at::date::text, 'nunca') AS ultimo_login
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
     ORDER BY 1
  LOOP
    RAISE NOTICE '% | perfil: % | google: % | último login: %',
      rpad(r.quem, 22), r.tem_no_perfil, r.tem_no_google, r.ultimo_login;
  END LOOP;
END $$;
