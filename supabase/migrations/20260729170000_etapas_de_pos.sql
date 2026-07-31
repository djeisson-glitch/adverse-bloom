-- =========================================================================
-- Etapas de pós: quem fez o quê, sem ninguém preencher nada.
--
-- Hoje a peça tem UM responsável, trocado na mão a cada troca de mão. O campo
-- só guarda o último valor, então "quem fez o quê" se perde — e o Djêisson
-- descreveu isso como "fica vago e meio solto".
--
-- Desenho combinado com ele:
--  • a trilha NÃO é declarada no início. A peça anda e, ao concluir, quem está
--    nela ou encerra a pós ou passa pra próxima etapa. Conteúdo pequeno (spot
--    de rádio, foto) nunca vê nada disso — segue um clique, como hoje.
--  • cada etapa tem CANDIDATOS configurados; o sistema sugere o menos
--    carregado, usando a mesma fila que calcula prazo. A ordem de preferência
--    desempata.
--  • avançar é SEMPRE opcional. Quem faz de ponta a ponta e não clica em nada
--    fica com tudo numa etapa só — registro honesto de "não foi separado",
--    melhor que obrigar a fatiar trabalho que ninguém pensou em fatias.
--  • "quem fez o quê" é DERIVADO das horas, não declarado. Campo que alguém
--    preenche desatualiza; fato que o sistema observa, não.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.etapas_pos (
  slug  text PRIMARY KEY,
  nome  text NOT NULL,
  ordem int  NOT NULL
);
ALTER TABLE public.etapas_pos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "etapas leitura" ON public.etapas_pos;
CREATE POLICY "etapas leitura" ON public.etapas_pos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "etapas admin" ON public.etapas_pos;
CREATE POLICY "etapas admin" ON public.etapas_pos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.etapas_pos (slug, nome, ordem) VALUES
  ('decupagem','Decupagem',1), ('montagem','Montagem',2), ('motion','Motion',3),
  ('color','Color',4), ('sound','Sound',5), ('legenda','Legenda',6),
  ('finalizacao','Finalização',7)
ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem;

-- Quem pode pegar cada etapa. preferencia = desempate quando a carga empata.
CREATE TABLE IF NOT EXISTS public.etapa_candidatos (
  etapa       text NOT NULL REFERENCES public.etapas_pos(slug) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preferencia int  NOT NULL DEFAULT 1,
  PRIMARY KEY (etapa, user_id)
);
ALTER TABLE public.etapa_candidatos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "candidatos leitura" ON public.etapa_candidatos;
CREATE POLICY "candidatos leitura" ON public.etapa_candidatos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "candidatos admin" ON public.etapa_candidatos;
CREATE POLICY "candidatos admin" ON public.etapa_candidatos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Configuração passada pelo Djêisson em 29/07/2026.
INSERT INTO public.etapa_candidatos (etapa, user_id, preferencia)
SELECT v.etapa, p.id, v.pref FROM (VALUES
  ('decupagem','josevictorvaz13@gmail.com',1),
  ('decupagem','juliasimionatobarufaldi@gmail.com',2),
  ('montagem','josevictorvaz13@gmail.com',1),
  ('montagem','contatorobertlisboa@gmail.com',2),
  ('motion','contatorobertlisboa@gmail.com',1),
  ('motion','josevictorvaz13@gmail.com',2),
  ('motion','djeisson@adverse.rec.br',3),
  ('color','djeisson@adverse.rec.br',1),
  ('sound','contatorobertlisboa@gmail.com',1),
  ('legenda','juliasimionatobarufaldi@gmail.com',1),
  ('finalizacao','djeisson@adverse.rec.br',1)
) AS v(etapa, email, pref)
JOIN public.profiles p ON lower(p.email) = v.email
ON CONFLICT (etapa, user_id) DO UPDATE SET preferencia = EXCLUDED.preferencia;

-- Etapa em que a peça está agora. NULL = ninguém separou por etapa, e tudo
-- bem: é o caso do conteúdo pequeno.
ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS etapa_atual text;

-- A hora carimba a etapa vigente no momento do play. Ninguém escolhe.
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS etapa text;

COMMENT ON COLUMN public.time_entries.etapa IS
  'Etapa da peça quando a hora foi iniciada. Preenchida pelo sistema — o cronômetro não pergunta.';

/**
 * Quem deve pegar esta etapa: o candidato com MENOS fila.
 *
 * Usa intake_fila_horas, a mesma conta que estima prazo — assim a sugestão de
 * quem pega e a promessa de quando entrega falam a mesma língua. Empate cai na
 * ordem de preferência configurada.
 */
CREATE OR REPLACE FUNCTION public.etapa_dono_sugerido(_etapa text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.user_id
    FROM public.etapa_candidatos c
    JOIN public.profiles p ON p.id = c.user_id AND coalesce(p.ativo, true)
   WHERE c.etapa = _etapa
   ORDER BY public.intake_fila_horas(c.user_id, 4) ASC, c.preferencia ASC
   LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.etapa_dono_sugerido(text) TO authenticated;

/**
 * Move a peça pra uma etapa. _user_id NULL = usa o sugerido.
 * É o mesmo gesto que hoje é "trocar o responsável na mão" — só que registra
 * qual etapa começou e em nome de quem.
 */
CREATE OR REPLACE FUNCTION public.mover_etapa(
  _deliverable_id uuid, _etapa text, _user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dono uuid;
BEGIN
  IF _etapa IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.etapas_pos WHERE slug = _etapa) THEN
    RETURN jsonb_build_object('erro', 'etapa desconhecida');
  END IF;

  dono := coalesce(_user_id, public.etapa_dono_sugerido(_etapa));

  UPDATE public.deliverables
     SET etapa_atual = _etapa,
         responsavel_id = coalesce(dono, responsavel_id)
   WHERE id = _deliverable_id;

  RETURN jsonb_build_object('ok', true, 'etapa', _etapa, 'responsavel', dono);
END $$;
GRANT EXECUTE ON FUNCTION public.mover_etapa(uuid, text, uuid) TO authenticated;

/**
 * Por quem a peça passou — derivado das HORAS, não de campo preenchido.
 * Hora sem etapa aparece como "não separado", que é a verdade.
 */
CREATE OR REPLACE FUNCTION public.passou_por(_deliverable_id uuid)
RETURNS TABLE (pessoa text, etapa text, etapa_nome text, ordem int, minutos int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(p.full_name, p.email, '—'),
         t.etapa,
         COALESCE(e.nome, 'Não separado'),
         COALESCE(e.ordem, 99),
         SUM(t.duration_min)::int
    FROM public.time_entries t
    LEFT JOIN public.profiles p   ON p.id = t.user_id
    LEFT JOIN public.etapas_pos e ON e.slug = t.etapa
   WHERE t.deliverable_id = _deliverable_id
   GROUP BY 1, 2, 3, 4
   ORDER BY 4, 5 DESC
$$;
GRANT EXECUTE ON FUNCTION public.passou_por(uuid) TO authenticated;
