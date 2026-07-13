-- =========================================================================
-- Cadastro de membros pelo admin (corrige "Database error saving new user")
--  • O signup é bloqueado pelo trigger de allowlist (trg_check_email_allowed).
--    admin_add_allowed_email libera o e-mail antes do signup.
--  • Não existe trigger que cria o profile no signup, nem policy de admin pra
--    escrever profile/role de outra pessoa. admin_upsert_membro (SECURITY
--    DEFINER, só admin) faz o upsert do profile + papel contornando a RLS.
--  • profiles.funcoes: permite MAIS DE UMA função por pessoa.
-- =========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS funcoes text[] NOT NULL DEFAULT '{}';

-- Libera um e-mail na allowlist (pré-requisito pro signup passar). Só admin.
CREATE OR REPLACE FUNCTION public.admin_add_allowed_email(_email text, _nota text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Só admin pode convidar membros';
  END IF;
  INSERT INTO public.allowed_emails (email, nota)
  VALUES (lower(btrim(_email)), coalesce(_nota, 'cadastrado pelo admin'))
  ON CONFLICT (email) DO NOTHING;
END;
$$;

-- Cria/atualiza o profile + papel de um membro. Só admin. Usa upsert pra
-- funcionar tanto no cadastro (profile ainda não existe) quanto na edição.
CREATE OR REPLACE FUNCTION public.admin_upsert_membro(
  _uid uuid, _email text, _nome text,
  _funcao text, _funcao_id uuid, _funcoes text[],
  _papel app_role, _horas int, _custo numeric, _ativo boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Só admin pode gerenciar membros';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, funcao, funcao_id, funcoes, custo_hora, horas_semana, ativo)
  VALUES (_uid, _nome, _email, _funcao, _funcao_id, coalesce(_funcoes, '{}'), _custo, coalesce(_horas, 40), coalesce(_ativo, true))
  ON CONFLICT (id) DO UPDATE SET
    full_name    = coalesce(excluded.full_name, public.profiles.full_name),
    email        = coalesce(excluded.email, public.profiles.email),
    funcao       = excluded.funcao,
    funcao_id    = excluded.funcao_id,
    funcoes      = excluded.funcoes,
    custo_hora   = excluded.custo_hora,
    horas_semana = excluded.horas_semana,
    ativo        = excluded.ativo;

  -- papel único por pessoa: zera e regrava
  DELETE FROM public.user_roles WHERE user_id = _uid;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _papel);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_allowed_email(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_membro(uuid, text, text, text, uuid, text[], app_role, int, numeric, boolean) TO authenticated;
