-- =========================================================================
-- Puxar a foto de quem já logou, sem esperar o próximo login
--
-- O trigger `tg_sync_avatar_google` só dispara quando o Supabase reescreve
-- `raw_user_meta_data` — o que acontece a cada login. Quem entrou pela última
-- vez ANTES do trigger existir continua sem foto até deslogar e entrar de
-- novo, e mandar o time deslogar pra ver a própria cara é pedir demais por
-- um avatar.
--
-- Mas o dado já está lá: quem logou com Google alguma vez tem
-- avatar_url/picture no metadata desde o primeiro acesso. Isto só copia o que
-- já existe.
--
-- `coalesce(p.avatar_url, ...)` NÃO — aqui é o contrário: a foto do Google
-- sobrescreve, porque ela é a atual. O caso de alguém ter posto uma foto na
-- mão não existe hoje (não há tela pra isso); quando existir, este backfill
-- precisa passar a respeitar.
-- =========================================================================

DO $$
DECLARE
  antes int;
  depois int;
BEGIN
  SELECT count(*) INTO antes FROM public.profiles WHERE avatar_url IS NOT NULL;

  UPDATE public.profiles p
     SET avatar_url = coalesce(
           u.raw_user_meta_data->>'avatar_url',
           u.raw_user_meta_data->>'picture'
         )
    FROM auth.users u
   WHERE u.id = p.id
     AND coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture') IS NOT NULL
     AND p.avatar_url IS DISTINCT FROM coalesce(
           u.raw_user_meta_data->>'avatar_url',
           u.raw_user_meta_data->>'picture'
         );

  SELECT count(*) INTO depois FROM public.profiles WHERE avatar_url IS NOT NULL;

  RAISE NOTICE 'fotos: % antes, % depois (de % perfis)',
    antes, depois, (SELECT count(*) FROM public.profiles);
  RAISE NOTICE 'ainda sem foto: %',
    coalesce((SELECT string_agg(coalesce(full_name, email), ', ')
                FROM public.profiles WHERE avatar_url IS NULL), 'ninguém');
END $$;

/**
 * Ressincroniza a foto de quem chamar, sob demanda.
 *
 * Serve pra tela poder oferecer "atualizar minha foto" sem depender de um
 * ciclo de logout — e pra quando alguém trocar a foto no Google e quiser ver
 * refletida na hora.
 */
CREATE OR REPLACE FUNCTION public.sincronizar_minha_foto()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  foto text;
BEGIN
  SELECT coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
    INTO foto
    FROM auth.users u
   WHERE u.id = auth.uid();

  IF foto IS NULL THEN
    RETURN NULL;   -- a conta Google desta pessoa não tem foto
  END IF;

  UPDATE public.profiles SET avatar_url = foto WHERE id = auth.uid();
  RETURN foto;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sincronizar_minha_foto() TO authenticated;
