-- =========================================================================
-- Tira o "não perturbe" e centraliza os horários do resumo.
--
-- Decisão do Djêisson: não-perturbe não existe (quem decide o que interrompe
-- é a classificação do evento e o painel por pessoa, não um botão de silêncio),
-- e o horário do resumo é UM só, definido pela gestão — usuário não escolhe.
--
-- Com isso a preferência por pessoa fica com uma dimensão só (o modo de cada
-- tipo), que é o que o painel do admin controla.
-- =========================================================================

-- ---- Ajuste global (linha única) ----------------------------------------
CREATE TABLE IF NOT EXISTS public.notificacao_ajustes (
  id           boolean PRIMARY KEY DEFAULT true CHECK (id),   -- garante 1 linha só
  digest_horas int[] NOT NULL DEFAULT '{9,14,17}',            -- hora local (BRT)
  updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.notificacao_ajustes (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.notificacao_ajustes ENABLE ROW LEVEL SECURITY;

-- Todo mundo lê (a tela do usuário mostra "os resumos chegam às 9h, 14h e
-- 17h" — informação, não escolha); só a gestão altera.
DROP POLICY IF EXISTS "ajustes leitura" ON public.notificacao_ajustes;
CREATE POLICY "ajustes leitura" ON public.notificacao_ajustes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ajustes admin" ON public.notificacao_ajustes;
CREATE POLICY "ajustes admin" ON public.notificacao_ajustes
  FOR ALL TO authenticated
  USING (public.pode_admin_notif(auth.uid())) WITH CHECK (public.pode_admin_notif(auth.uid()));

/** Horários do resumo (globais). */
CREATE OR REPLACE FUNCTION public.notif_horas_resumo()
RETURNS int[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT a.digest_horas FROM public.notificacao_ajustes a WHERE a.id), '{9,14,17}'::int[])
$$;

CREATE OR REPLACE FUNCTION public.notif_ajustes_salvar(_digest_horas int[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_admin_notif(auth.uid()) THEN
    RAISE EXCEPTION 'só a gestão define os horários do resumo';
  END IF;
  INSERT INTO public.notificacao_ajustes (id, digest_horas, updated_at)
  VALUES (true, COALESCE(_digest_horas, '{9,14,17}'::int[]), now())
  ON CONFLICT (id) DO UPDATE SET digest_horas = EXCLUDED.digest_horas, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.notif_horas_resumo()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_ajustes_salvar(int[]) TO authenticated;

-- ---- Regra de ouro agora tem 3 filtros (o DND saiu) ---------------------
CREATE OR REPLACE FUNCTION public.pode_push(_user_id uuid, _tipo text, _nivel int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  --  1) o nível permite push?    (3 nunca)
  --  2) a pessoa quer este tipo? (modo push, do painel)
  -- O 3º filtro (agrupar por group_key) é do push-enviar, que precisa olhar o
  -- conjunto de pendentes — não dá pra decidir linha a linha aqui.
  SELECT _nivel <> 3 AND public.notif_modo(_user_id, _tipo) = 'push'
$$;

-- ---- Digest: horário global, não mais por pessoa ------------------------
CREATE OR REPLACE FUNCTION public.notif_pendentes_digest(_limite int DEFAULT 500)
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
     AND n.nivel = 2
     AND n.push_tentativas < 5
     AND EXTRACT(hour FROM now() AT TIME ZONE 'America/Sao_Paulo')::int
         = ANY (public.notif_horas_resumo())
     AND public.pode_push(n.user_id, n.tipo, n.nivel)
   ORDER BY n.user_id, n.created_at
   LIMIT _limite;
$$;

REVOKE ALL ON FUNCTION public.notif_pendentes_digest(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notif_pendentes_digest(int) TO service_role;

-- ---- Fora o que virou opção do usuário ----------------------------------
-- Ordem importa: as funções acima já não referenciam notificacao_config, então
-- dá pra derrubar a tabela sem CASCADE (que levaria junto o que não deve).
DROP FUNCTION IF EXISTS public.notif_config_salvar(uuid, int[], timestamptz, boolean);
DROP TABLE IF EXISTS public.notificacao_config;
