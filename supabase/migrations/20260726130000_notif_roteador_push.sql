-- =========================================================================
-- Roteador de push — quem tem direito de sair, e quando.
--
-- A decisão vive AQUI (SQL), não no TypeScript da edge function: a regra é a
-- mesma pro push imediato e pro resumo, e duplicar isso em dois lugares é
-- pedir pra elas divergirem.
--
--   notif_pendentes_push()    -> nível 1, sai na hora
--   notif_pendentes_digest()  -> nível 2, só na hora do resumo daquela pessoa
--
-- Nos dois casos já aplica: nível + preferência da pessoa + não-perturbe.
-- O agrupamento por group_key é o único filtro que fica na edge function,
-- porque depende de olhar o conjunto (contar quantos são do mesmo grupo).
-- =========================================================================

/** Nível 1 pendente e elegível — o que pode interromper agora. */
CREATE OR REPLACE FUNCTION public.notif_pendentes_push(_limite int DEFAULT 100)
RETURNS TABLE (
  id uuid, user_id uuid, tipo text, titulo text, corpo text, link text,
  nivel int, group_key text, rotulo text, push_tentativas int
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.user_id, n.tipo, n.titulo, n.corpo, n.link,
         n.nivel, n.group_key, COALESCE(t.rotulo, n.tipo), n.push_tentativas
    FROM public.notificacoes n
    LEFT JOIN public.notificacao_tipos t ON t.tipo = n.tipo
   WHERE n.push_em IS NULL
     AND n.nivel = 1
     AND n.push_tentativas < 5
     AND public.pode_push(n.user_id, n.tipo, n.nivel)
   ORDER BY n.created_at
   LIMIT _limite;
$$;

/**
 * Nível 2 pendente, SÓ das pessoas cujo horário de resumo é agora.
 *
 * O cron roda de hora em hora e esta função é que decide de quem é a vez —
 * assim cada um escolhe seus horários (digest_horas) sem precisar de um cron
 * por pessoa. Quem não configurou usa 9h/14h/17h (default da coluna).
 */
CREATE OR REPLACE FUNCTION public.notif_pendentes_digest(_limite int DEFAULT 500)
RETURNS TABLE (
  id uuid, user_id uuid, tipo text, titulo text, corpo text, link text,
  nivel int, group_key text, rotulo text, push_tentativas int
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH hora_agora AS (
    SELECT EXTRACT(hour FROM now() AT TIME ZONE 'America/Sao_Paulo')::int AS h
  )
  SELECT n.id, n.user_id, n.tipo, n.titulo, n.corpo, n.link,
         n.nivel, n.group_key, COALESCE(t.rotulo, n.tipo), n.push_tentativas
    FROM public.notificacoes n
    LEFT JOIN public.notificacao_tipos t ON t.tipo = n.tipo
    LEFT JOIN public.notificacao_config c ON c.user_id = n.user_id
   CROSS JOIN hora_agora ha
   WHERE n.push_em IS NULL
     AND n.nivel = 2
     AND n.push_tentativas < 5
     AND ha.h = ANY (COALESCE(c.digest_horas, '{9,14,17}'::int[]))
     AND public.pode_push(n.user_id, n.tipo, n.nivel)
   ORDER BY n.user_id, n.created_at
   LIMIT _limite;
$$;

REVOKE ALL ON FUNCTION public.notif_pendentes_push(int)   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_pendentes_digest(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notif_pendentes_push(int)   TO service_role;
GRANT EXECUTE ON FUNCTION public.notif_pendentes_digest(int) TO service_role;

-- ---- Cron do resumo (nível 2) -------------------------------------------
-- De hora em hora; quem decide de quem é a vez é a função acima.
DO $$ BEGIN PERFORM cron.unschedule('notificacoes-digest-nivel2'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'notificacoes-digest-nivel2',
  '0 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://ythmkxudzaoaayxxlgqy.supabase.co/functions/v1/push-enviar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aG1reHVkemFvYWF5eHhsZ3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0MjAsImV4cCI6MjA5NTg4OTQyMH0.Iww1k1QUKqD1EUqi1d8CLSl0Erd_6VHkk3KWKaMowNI',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aG1reHVkemFvYWF5eHhsZ3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0MjAsImV4cCI6MjA5NTg4OTQyMH0.Iww1k1QUKqD1EUqi1d8CLSl0Erd_6VHkk3KWKaMowNI'
    ),
    body := '{"modo":"digest"}'::jsonb
  );
  $job$
);

-- ---- RPCs da tela de preferências ---------------------------------------
/** Salva o modo de um tipo pra uma pessoa (a própria, ou qualquer uma se admin). */
CREATE OR REPLACE FUNCTION public.notif_pref_salvar(_user_id uuid, _tipo text, _modo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id <> auth.uid() AND NOT public.pode_admin_notif(auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão para mexer na preferência de outra pessoa';
  END IF;
  IF _modo NOT IN ('push', 'sino', 'off') THEN
    RAISE EXCEPTION 'modo inválido: %', _modo;
  END IF;

  INSERT INTO public.notificacao_prefs (user_id, tipo, modo)
  VALUES (_user_id, _tipo, _modo)
  ON CONFLICT (user_id, tipo) DO UPDATE SET modo = EXCLUDED.modo;
END;
$$;

/** Horários do resumo e não-perturbe. */
CREATE OR REPLACE FUNCTION public.notif_config_salvar(
  _user_id uuid, _digest_horas int[] DEFAULT NULL, _dnd_ate timestamptz DEFAULT NULL,
  _limpar_dnd boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id <> auth.uid() AND NOT public.pode_admin_notif(auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  INSERT INTO public.notificacao_config (user_id, digest_horas, dnd_ate, updated_at)
  VALUES (_user_id, COALESCE(_digest_horas, '{9,14,17}'::int[]),
          CASE WHEN _limpar_dnd THEN NULL ELSE _dnd_ate END, now())
  ON CONFLICT (user_id) DO UPDATE SET
    digest_horas = COALESCE(_digest_horas, public.notificacao_config.digest_horas),
    -- _limpar_dnd distingue "não mexi no DND" de "quero desligar o DND":
    -- sem essa flag, passar NULL seria ambíguo e nunca daria pra sair do modo foco.
    dnd_ate = CASE WHEN _limpar_dnd THEN NULL
                   ELSE COALESCE(_dnd_ate, public.notificacao_config.dnd_ate) END,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.notif_pref_salvar(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_config_salvar(uuid, int[], timestamptz, boolean) TO authenticated;

/**
 * Painel do admin: todo mundo × todos os tipos, com o modo EFETIVO já
 * resolvido (preferência gravada ou padrão do catálogo). Uma chamada só em
 * vez de N×M — a tela é uma matriz.
 */
CREATE OR REPLACE FUNCTION public.notif_matriz()
RETURNS TABLE (
  user_id uuid, nome text, email text,
  tipo text, rotulo text, grupo text, nivel int, ordem int,
  modo text, explicito boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, COALESCE(p.full_name, p.email), p.email,
         t.tipo, t.rotulo, t.grupo, t.nivel_padrao, t.ordem,
         COALESCE(pr.modo, CASE WHEN t.nivel_padrao = 3 THEN 'sino' ELSE 'push' END),
         pr.modo IS NOT NULL
    FROM public.profiles p
   CROSS JOIN public.notificacao_tipos t
    LEFT JOIN public.notificacao_prefs pr ON pr.user_id = p.id AND pr.tipo = t.tipo
   WHERE COALESCE(p.ativo, true)
     AND public.pode_admin_notif(auth.uid())   -- só admin enxerga a matriz
   ORDER BY COALESCE(p.full_name, p.email), t.ordem;
$$;

GRANT EXECUTE ON FUNCTION public.notif_matriz() TO authenticated;
