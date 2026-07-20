-- =====================================================================
-- Trocar o papel de alguém agora RESETA os acessos padrão do novo papel.
--
--  Bug: admin_upsert_membro só trocava user_roles. Quem virava coordenadora
--  continuava com as concessões de horas/timesheet do papel antigo (equipe),
--  e como canSeeHours liga por concessão, seguia vendo horas — o papel novo
--  não "colava". Agora, quando o papel MUDA, limpa as permissões e re-semeia
--  os padrões do novo papel. Editar outros campos (nome, custo) NÃO mexe nas
--  permissões — só a troca de papel reseta.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_upsert_membro(
  _uid uuid, _email text, _nome text,
  _funcao text, _funcao_id uuid, _funcoes text[],
  _papel app_role, _horas int, _custo numeric, _ativo boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _papel_atual app_role;
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

  SELECT role INTO _papel_atual FROM public.user_roles WHERE user_id = _uid LIMIT 1;

  DELETE FROM public.user_roles WHERE user_id = _uid;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _papel);

  IF _papel_atual IS DISTINCT FROM _papel THEN
    DELETE FROM public.user_permissions WHERE user_id = _uid;
    PERFORM public.seed_acessos_padrao(_uid, _papel::text);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_membro(uuid, text, text, text, uuid, text[], app_role, int, numeric, boolean) TO authenticated;
