-- =========================================================================
-- A foto do Google já chegava e ninguém copiava.
--
-- O login é OAuth do Google, então auth.users.raw_user_meta_data traz
-- avatar_url/picture desde o primeiro acesso. Só que profiles.avatar_url é
-- preenchido pelo aceite de convite, que não olha esses campos — resultado:
-- todo mundo com as iniciais no lugar da cara.
--
-- Sincroniza no login (o Supabase reescreve raw_user_meta_data a cada
-- entrada), então a foto também se ATUALIZA sozinha quando a pessoa troca no
-- Google.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_sync_avatar_google()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE foto text; nome text;
BEGIN
  foto := coalesce(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );
  nome := coalesce(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name'
  );

  UPDATE public.profiles p
     SET avatar_url = coalesce(foto, p.avatar_url),
         -- nome só entra se ainda não houver: o cadastrado aqui manda, porque
         -- alguém pode ter corrigido na mão.
         full_name  = coalesce(nullif(p.full_name, ''), nome, p.full_name)
   WHERE p.id = NEW.id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_avatar_google ON auth.users;
CREATE TRIGGER trg_sync_avatar_google
  AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_avatar_google();

-- Backfill de quem já entrou alguma vez.
UPDATE public.profiles p
   SET avatar_url = coalesce(
         u.raw_user_meta_data->>'avatar_url',
         u.raw_user_meta_data->>'picture'
       )
  FROM auth.users u
 WHERE u.id = p.id
   AND coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture') IS NOT NULL;
