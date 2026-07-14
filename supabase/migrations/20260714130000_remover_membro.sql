-- =========================================================================
-- Tirar alguém do sistema — do jeito certo
--
--  ⚠️ time_entries.user_id é ON DELETE CASCADE: apagar o usuário APAGA todas
--  as horas apontadas por ele (idem time_planning e project_members). Ou seja,
--  "excluir" destrói histórico que já virou relatório/fatura.
--
--  Por isso, duas ações:
--   • admin_desativar_membro — REVOGA O ACESSO e preserva o histórico.
--     Marca profiles.ativo=false, tira o papel, tira da allowlist E bane o
--     usuário no auth (a allowlist só barra cadastro NOVO — sem o ban a pessoa
--     continuaria entrando). Derruba as sessões abertas. Reversível.
--   • admin_excluir_membro — apaga de vez, mas SÓ se a pessoa nunca apontou
--     hora. Se apontou, o banco recusa e manda desativar.
--
--  Guardas: ninguém tira a si mesmo, e não dá pra ficar sem admin.
-- =========================================================================

-- ---- Guarda: é o último admin? -----------------------------------------
CREATE OR REPLACE FUNCTION public.eh_ultimo_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'admin')
     AND (SELECT count(*) FROM public.user_roles WHERE role = 'admin') <= 1;
$$;

-- ---- Desativar (revogar acesso, preservando histórico) ------------------
CREATE OR REPLACE FUNCTION public.admin_desativar_membro(_uid uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Só admin pode remover membros';
  END IF;
  IF _uid = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode revogar o próprio acesso';
  END IF;
  IF public.eh_ultimo_admin(_uid) THEN
    RAISE EXCEPTION 'Esse é o último admin — promova outra pessoa antes';
  END IF;

  SELECT lower(email) INTO e FROM auth.users WHERE id = _uid;

  UPDATE public.profiles SET ativo = false WHERE id = _uid;
  DELETE FROM public.user_roles   WHERE user_id = _uid;
  DELETE FROM public.allowed_emails WHERE lower(email) = e;

  -- Ban no auth: sem isso a pessoa continuaria logando (o trigger da allowlist
  -- só roda no INSERT de auth.users, não em login de usuário existente).
  UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = _uid;

  -- Derruba sessões abertas (o access token atual expira em ~1h de qualquer jeito).
  BEGIN
    DELETE FROM auth.sessions WHERE user_id = _uid;
  EXCEPTION WHEN OTHERS THEN
    NULL;   -- versões antigas do GoTrue não têm auth.sessions
  END;
END;
$$;

-- ---- Reativar -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reativar_membro(_uid uuid, _papel app_role DEFAULT 'equipe')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e text; n text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Só admin pode reativar membros';
  END IF;

  SELECT lower(u.email), p.full_name INTO e, n
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
   WHERE u.id = _uid;

  UPDATE public.profiles SET ativo = true WHERE id = _uid;

  DELETE FROM public.user_roles WHERE user_id = _uid;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, coalesce(_papel, 'equipe'));

  INSERT INTO public.allowed_emails (email, nota, nome, papel, usado_em)
  VALUES (e, 'reativado pelo admin', n, coalesce(_papel, 'equipe'), now())
  ON CONFLICT (email) DO UPDATE SET papel = excluded.papel, usado_em = now();

  UPDATE auth.users SET banned_until = NULL WHERE id = _uid;
END;
$$;

-- ---- Excluir de vez (só sem histórico de horas) -------------------------
CREATE OR REPLACE FUNCTION public.admin_excluir_membro(_uid uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e text; n_horas int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Só admin pode excluir membros';
  END IF;
  IF _uid = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir a si mesmo';
  END IF;
  IF public.eh_ultimo_admin(_uid) THEN
    RAISE EXCEPTION 'Esse é o último admin — promova outra pessoa antes';
  END IF;

  SELECT count(*) INTO n_horas FROM public.time_entries WHERE user_id = _uid;
  IF coalesce(n_horas, 0) > 0 THEN
    RAISE EXCEPTION 'Essa pessoa tem % apontamento(s) de hora. Excluir apagaria esse histórico — use "Revogar acesso" no lugar.', n_horas;
  END IF;

  SELECT lower(email) INTO e FROM auth.users WHERE id = _uid;
  DELETE FROM public.allowed_emails WHERE lower(email) = e;
  DELETE FROM auth.users WHERE id = _uid;   -- cascata: profiles, user_roles, project_members, time_planning
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_desativar_membro(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reativar_membro(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_excluir_membro(uuid) TO authenticated;
