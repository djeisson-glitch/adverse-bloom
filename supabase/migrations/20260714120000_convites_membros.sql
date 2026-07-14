-- =========================================================================
-- Login organizado: CONVITE (sem senha), Google como único jeito de entrar
--
--  Problema: o cadastro criava um usuário auth com e-mail+SENHA, mas o login
--  só tem Google — a senha nunca era usada. E o usuário pré-criado brigava com
--  a identidade do Google no primeiro login.
--
--  Agora: cadastrar = CONVIDAR. Não cria usuário nenhum.
--   • allowed_emails vira a ficha do convite (nome, papel, funções, custo…).
--   • A pessoa entra com Google; o trigger de allowlist deixa passar e um novo
--     trigger PROVISIONA o profile + papel a partir do convite, no 1º login.
--   • usado_em marca quem já entrou (a tela mostra "aguardando 1º login").
-- =========================================================================

-- ---- O convite carrega a ficha do membro --------------------------------
ALTER TABLE public.allowed_emails
  ADD COLUMN IF NOT EXISTS nome         text,
  ADD COLUMN IF NOT EXISTS papel        app_role NOT NULL DEFAULT 'equipe',
  ADD COLUMN IF NOT EXISTS funcao       text,
  ADD COLUMN IF NOT EXISTS funcao_id    uuid,
  ADD COLUMN IF NOT EXISTS funcoes      text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS horas_semana int NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS custo_hora   numeric,
  ADD COLUMN IF NOT EXISTS usado_em     timestamptz;   -- 1º login já aconteceu

-- Quem já tem usuário, já usou o convite.
UPDATE public.allowed_emails a
   SET usado_em = now()
  FROM auth.users u
 WHERE lower(u.email) = lower(a.email)
   AND a.usado_em IS NULL;

-- ---- Convidar (= cadastrar) --------------------------------------------
-- Sem senha, sem signUp. Se a pessoa JÁ entrou alguma vez, aplica direto no
-- profile (assim a mesma função serve pra cadastrar e pra editar).
CREATE OR REPLACE FUNCTION public.admin_convidar_membro(
  _email text, _nome text,
  _funcao text, _funcao_id uuid, _funcoes text[],
  _papel app_role, _horas int, _custo numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e text; uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Só admin pode convidar membros';
  END IF;
  e := lower(btrim(coalesce(_email, '')));
  IF e = '' THEN RAISE EXCEPTION 'Informe o e-mail'; END IF;

  INSERT INTO public.allowed_emails
    (email, nota, nome, papel, funcao, funcao_id, funcoes, horas_semana, custo_hora)
  VALUES
    (e, 'convite pelo admin', _nome, coalesce(_papel, 'equipe'), _funcao, _funcao_id,
     coalesce(_funcoes, '{}'), coalesce(_horas, 40), _custo)
  ON CONFLICT (email) DO UPDATE SET
    nome         = excluded.nome,
    papel        = excluded.papel,
    funcao       = excluded.funcao,
    funcao_id    = excluded.funcao_id,
    funcoes      = excluded.funcoes,
    horas_semana = excluded.horas_semana,
    custo_hora   = excluded.custo_hora;

  -- Já entrou antes? aplica no profile/papel agora mesmo.
  SELECT id INTO uid FROM auth.users WHERE lower(email) = e LIMIT 1;
  IF uid IS NOT NULL THEN
    PERFORM public.admin_upsert_membro(
      uid, e, _nome, _funcao, _funcao_id, coalesce(_funcoes, '{}'),
      coalesce(_papel, 'equipe'), coalesce(_horas, 40), _custo, true);
    UPDATE public.allowed_emails SET usado_em = now() WHERE email = e;
    RETURN jsonb_build_object('ok', true, 'ja_entrou', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'ja_entrou', false);
END;
$$;

-- ---- Cancelar convite (só se a pessoa ainda não entrou) -----------------
CREATE OR REPLACE FUNCTION public.admin_remover_convite(_email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Só admin pode remover convites';
  END IF;
  -- usado_em NOT NULL = pessoa ativa; não deixamos tirar o acesso por engano aqui.
  DELETE FROM public.allowed_emails
   WHERE lower(email) = lower(btrim(_email)) AND usado_em IS NULL;
END;
$$;

-- ---- Provisiona o membro no 1º login (Google) ---------------------------
-- O BEFORE trigger (check_email_allowed) já garantiu que o e-mail foi convidado.
CREATE OR REPLACE FUNCTION public.tg_provisionar_membro()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM public.allowed_emails WHERE lower(email) = lower(NEW.email) LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.profiles (id, full_name, email, funcao, funcao_id, funcoes, custo_hora, horas_semana, ativo)
  VALUES (
    NEW.id,
    coalesce(nullif(btrim(coalesce(c.nome, '')), ''), NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email, c.funcao, c.funcao_id, coalesce(c.funcoes, '{}'), c.custo_hora, coalesce(c.horas_semana, 40), true
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name    = coalesce(public.profiles.full_name, excluded.full_name),
    email        = excluded.email,
    funcao       = coalesce(public.profiles.funcao, excluded.funcao),
    funcao_id    = coalesce(public.profiles.funcao_id, excluded.funcao_id),
    funcoes      = CASE WHEN coalesce(array_length(public.profiles.funcoes, 1), 0) = 0
                        THEN excluded.funcoes ELSE public.profiles.funcoes END,
    custo_hora   = coalesce(public.profiles.custo_hora, excluded.custo_hora),
    horas_semana = coalesce(public.profiles.horas_semana, excluded.horas_semana),
    ativo        = true;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, coalesce(c.papel, 'equipe'))
  ON CONFLICT DO NOTHING;

  UPDATE public.allowed_emails SET usado_em = now() WHERE lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provisionar_membro ON auth.users;
CREATE TRIGGER trg_provisionar_membro
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_provisionar_membro();

GRANT EXECUTE ON FUNCTION public.admin_convidar_membro(text, text, text, uuid, text[], app_role, int, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remover_convite(text) TO authenticated;
