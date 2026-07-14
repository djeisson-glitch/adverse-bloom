-- =========================================================================
-- Custo/hora fora de profiles — o último vazamento do lado do dinheiro
--
--  A RLS do Postgres protege LINHA, não COLUNA. A policy de profiles é
--  "FOR SELECT TO authenticated USING (true)" — e tem que ser, porque todo
--  mundo precisa ler nome, e-mail e avatar dos colegas pra montar responsável,
--  comentário, aprovação. Só que custo_hora morava nessa mesma linha: qualquer
--  pessoa logada lia, pela API, quanto cada colega custa por hora.
--
--  Esconder a coluna na tela não resolve — o REST devolve a linha inteira.
--  A única saída é tirar o dado da tabela aberta e botar numa tabela lateral
--  com policy própria. Mesma lógica pra allowed_emails, que passou a guardar
--  o custo do convidado e também era lida por qualquer logado.
-- =========================================================================

-- ---- A tabela lateral, trancada -----------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles_custo (
  user_id     uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  custo_hora  numeric(12,2),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Leva o que já existe (antes de derrubar a coluna).
INSERT INTO public.profiles_custo (user_id, custo_hora)
SELECT id, custo_hora FROM public.profiles WHERE custo_hora IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.profiles_custo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "custo gestao" ON public.profiles_custo;
CREATE POLICY "custo gestao" ON public.profiles_custo
  FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro())
  WITH CHECK (public.pode_ver_dinheiro());

-- ---- As views que usavam profiles.custo_hora ----------------------------
-- LEFT JOIN de propósito: pra quem não pode ver dinheiro, a RLS some com as
-- linhas de profiles_custo e o custo vira 0 — a view continua devolvendo as
-- HORAS (que a equipe precisa) em vez de estourar ou vir vazia.
CREATE OR REPLACE VIEW public.v_horas_por_projeto AS
SELECT
  te.project_id,
  SUM(te.duration_min) / 60.0                                        AS horas_totais,
  SUM(CASE WHEN te.billable THEN te.duration_min ELSE 0 END) / 60.0  AS horas_faturaveis,
  SUM(te.duration_min * COALESCE(pc.custo_hora, 0)) / 60.0           AS custo_interno
FROM public.time_entries te
JOIN public.profiles p        ON p.id = te.user_id
LEFT JOIN public.profiles_custo pc ON pc.user_id = te.user_id
GROUP BY te.project_id;

CREATE OR REPLACE VIEW public.v_custo_equipe_projeto AS
SELECT
  te.project_id,
  te.user_id,
  p.full_name,
  p.email,
  SUM(te.duration_min) / 60.0 AS horas,
  COALESCE(pc.custo_hora, proj.custo_hora_padrao, 0) AS custo_hora_efetivo,
  (SUM(te.duration_min) / 60.0) * COALESCE(pc.custo_hora, proj.custo_hora_padrao, 0) AS custo
FROM public.time_entries te
JOIN public.profiles p             ON p.id = te.user_id
JOIN public.projects proj          ON proj.id = te.project_id
LEFT JOIN public.profiles_custo pc ON pc.user_id = te.user_id
WHERE te.project_id IS NOT NULL
GROUP BY te.project_id, te.user_id, p.full_name, p.email, pc.custo_hora, proj.custo_hora_padrao;

-- CREATE OR REPLACE não garante manter as reloptions — reafirma.
ALTER VIEW public.v_horas_por_projeto    SET (security_invoker = on);
ALTER VIEW public.v_custo_equipe_projeto SET (security_invoker = on);

-- ---- Agora sim: fora da tabela aberta -----------------------------------
ALTER TABLE public.profiles DROP COLUMN IF EXISTS custo_hora;

-- ---- allowed_emails: convite não é leitura pública ----------------------
-- Guarda custo_hora do convidado, papel e funções. Só admin.
DROP POLICY IF EXISTS "authenticated read allowed_emails" ON public.allowed_emails;
DROP POLICY IF EXISTS "allowed_emails admin" ON public.allowed_emails;
CREATE POLICY "allowed_emails admin" ON public.allowed_emails
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---- As funções que escreviam profiles.custo_hora -----------------------
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

  INSERT INTO public.profiles (id, full_name, email, funcao, funcao_id, funcoes, horas_semana, ativo)
  VALUES (_uid, _nome, _email, _funcao, _funcao_id, coalesce(_funcoes, '{}'), coalesce(_horas, 40), coalesce(_ativo, true))
  ON CONFLICT (id) DO UPDATE SET
    full_name    = coalesce(excluded.full_name, public.profiles.full_name),
    email        = coalesce(excluded.email, public.profiles.email),
    funcao       = excluded.funcao,
    funcao_id    = excluded.funcao_id,
    funcoes      = excluded.funcoes,
    horas_semana = excluded.horas_semana,
    ativo        = excluded.ativo;

  INSERT INTO public.profiles_custo (user_id, custo_hora)
  VALUES (_uid, _custo)
  ON CONFLICT (user_id) DO UPDATE SET custo_hora = excluded.custo_hora, updated_at = now();

  -- papel único por pessoa: zera e regrava
  DELETE FROM public.user_roles WHERE user_id = _uid;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _papel);
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_provisionar_membro()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM public.allowed_emails WHERE lower(email) = lower(NEW.email) LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.profiles (id, full_name, email, funcao, funcao_id, funcoes, horas_semana, ativo)
  VALUES (
    NEW.id,
    coalesce(nullif(btrim(coalesce(c.nome, '')), ''), NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email, c.funcao, c.funcao_id, coalesce(c.funcoes, '{}'), coalesce(c.horas_semana, 40), true
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name    = coalesce(public.profiles.full_name, excluded.full_name),
    email        = excluded.email,
    funcao       = coalesce(public.profiles.funcao, excluded.funcao),
    funcao_id    = coalesce(public.profiles.funcao_id, excluded.funcao_id),
    funcoes      = CASE WHEN coalesce(array_length(public.profiles.funcoes, 1), 0) = 0
                        THEN excluded.funcoes ELSE public.profiles.funcoes END,
    horas_semana = coalesce(public.profiles.horas_semana, excluded.horas_semana),
    ativo        = true;

  IF c.custo_hora IS NOT NULL THEN
    INSERT INTO public.profiles_custo (user_id, custo_hora)
    VALUES (NEW.id, c.custo_hora)
    ON CONFLICT (user_id) DO NOTHING;   -- não sobrescreve o que a gestão já ajustou
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, coalesce(c.papel, 'equipe'))
  ON CONFLICT DO NOTHING;

  UPDATE public.allowed_emails SET usado_em = now() WHERE lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

-- ---- Escrita do custo pela UI (gestão) ----------------------------------
CREATE OR REPLACE FUNCTION public.set_custo_hora(_user_id uuid, _valor numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_ver_dinheiro() THEN
    RAISE EXCEPTION 'Sem permissão para mexer em custo/hora';
  END IF;

  INSERT INTO public.profiles_custo (user_id, custo_hora)
  VALUES (_user_id, _valor)
  ON CONFLICT (user_id) DO UPDATE SET custo_hora = excluded.custo_hora, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_custo_hora(uuid, numeric) TO authenticated;
