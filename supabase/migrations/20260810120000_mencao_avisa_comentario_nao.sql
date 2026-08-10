-- =========================================================================
-- Ser marcado com @ passa a avisar. Comentário solto continua calado.
--
-- Djêisson (10/08/2026): "nosso grande problema tem sido as notificações.
-- pensei que o slack pudesse melhorar isso além da gente ter um espaço pra
-- falarmos profissionalmente, não no whatsapp" — e, sobre o histórico:
-- "já usamos slack, depois fomos para o discord. mas a questão de duas
-- plataformas era problema".
--
-- MEDIDO ANTES DE MEXER (30 dias, produção):
--
--   perfis ativos ........................ 6   (5 com push ligado)
--   notificações criadas ............... 1210  (997 lidas — 82%)
--   comentários no chat do OS ........... 229
--   deles, marcando alguém com @ ........ 119  (52%)
--   push disparados por esses 119 ......... 0
--
-- O sistema NÃO está mudo por falta de canal: 864 das 1210 viraram push. Está
-- mudo exatamente onde a conversa acontece. Todo comentário nasce com o tipo
-- `mensagem`, que eu classifiquei como nível 3 em 26/07 justamente pra cortar
-- volume — e nível 3 nunca vira push. A regra pegou junto o caso que ela não
-- devia pegar: quando alguém escreve @fulano, está chamando o fulano.
--
-- É por isso que o Slack parecia a resposta. Lá, canal é silencioso e menção
-- avisa. Aqui os dois casos eram a mesma coisa, e o silencioso venceu.
--
-- A CORREÇÃO é essa distinção, não uma terceira plataforma:
--
--   mencao    nível 1  →  "Fulano te marcou"   — push na hora
--   mensagem  nível 3  →  "Fulano comentou"    — só no sino, como já era
--
-- Custo estimado em push novo: ~4/dia no time inteiro (119 em 30 dias), e
-- cada um deles é alguém chamando alguém pelo nome. Não é volume novo, é o
-- volume que já existia e não chegava.
--
-- O que NÃO muda: quem só acompanha o fio continua recebendo no sino; a
-- coordenação (copia_conversas) segue recebendo cópia como `mensagem` e não
-- ganha push por menção alheia — ser copiado não é ser chamado.
--
-- Preferência: quem desligar `mensagem` NÃO desliga `mencao` junto. São
-- eventos diferentes de propósito — "não quero acompanhar todo comentário"
-- não quer dizer "não me chame".
-- =========================================================================

INSERT INTO public.notificacao_tipos (tipo, rotulo, descricao, grupo, nivel_padrao, ordem) VALUES
  ('mencao', 'Te marcaram (@)', 'Alguém escreveu @ pra você numa conversa', 'conversas', 1, 20)
ON CONFLICT (tipo) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_comment_notifica()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _autor text;
  _dest uuid[] := '{}';
  _marcados uuid[] := '{}';
  _pid uuid;
  _link text;
  _corpo text;
  u uuid;
BEGIN
  SELECT full_name INTO _autor FROM public.profiles WHERE id = NEW.user_id;
  _autor := COALESCE(NULLIF(_autor, ''), 'Alguém');
  _corpo := left(NEW.body, 160);

  -- Link certo por tipo de entidade (não muda quem recebe).
  IF NEW.entity_type = 'task' THEN
    SELECT project_id INTO _pid FROM public.tasks WHERE id = NEW.entity_id;
    _link := '/projetos/' || COALESCE(_pid::text, '');
  ELSIF NEW.entity_type = 'deliverable' THEN
    SELECT project_id INTO _pid FROM public.deliverables WHERE id = NEW.entity_id;
    _link := '/projetos/' || COALESCE(_pid::text, '') || '/entregaveis/' || NEW.entity_id::text;
  ELSIF NEW.entity_type = 'project' THEN
    _link := '/projetos/' || NEW.entity_id::text;
  ELSIF NEW.entity_type = 'deal' THEN
    _link := '/comercial';
  ELSE
    _link := '/notificacoes';
  END IF;

  -- Quem foi chamado NESTA mensagem. Só isso é menção: ter sido marcado
  -- semana passada não faz de cada comentário novo um chamado.
  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO _marcados
    FROM unnest(COALESCE(NEW.mentions, '{}')) AS x
   WHERE x IS NOT NULL AND x <> NEW.user_id;

  -- Destinatários = participantes (quem já comentou) + TODOS os @mencionados
  -- em qualquer mensagem do fio + os mencionados nesta mensagem.
  SELECT COALESCE(array_agg(DISTINCT q.uid), '{}')
    INTO _dest
  FROM (
    SELECT user_id AS uid
      FROM public.comments
     WHERE entity_type = NEW.entity_type AND entity_id = NEW.entity_id AND user_id IS NOT NULL
    UNION
    SELECT unnest(mentions) AS uid
      FROM public.comments
     WHERE entity_type = NEW.entity_type AND entity_id = NEW.entity_id
    UNION
    SELECT unnest(NEW.mentions) AS uid
  ) q
  WHERE q.uid IS NOT NULL;

  -- + coordenação (copia_conversas). É override intencional, não poluição.
  _dest := _dest || COALESCE((SELECT array_agg(id) FROM public.profiles WHERE copia_conversas), '{}');

  -- 1) Os chamados. Push na hora, e o título diz o que aconteceu.
  FOREACH u IN ARRAY _marcados LOOP
    PERFORM public.notificar(u, 'mencao', 'importante', _autor || ' te marcou', _corpo, _link, NULL);
  END LOOP;

  -- 2) O resto do fio. Sino, como sempre foi — menos quem já recebeu como
  --    menção, senão o mesmo comentário chega duas vezes pra mesma pessoa.
  FOR u IN
    SELECT DISTINCT x FROM unnest(_dest) AS x
    WHERE x IS NOT NULL AND x <> NEW.user_id AND NOT (x = ANY(_marcados))
  LOOP
    PERFORM public.notificar(u, 'mensagem', 'info', _autor || ' comentou', _corpo, _link, NULL);
  END LOOP;

  RETURN NEW;
END; $$;

-- ---------------------------------------------------------------- medição
-- Exercita o gatilho de verdade — insere um comentário com menção, confere
-- os dois caminhos e DESFAZ. A subtransação (BEGIN ... EXCEPTION) é o que
-- garante o desfazer: o insert de teste nunca chega a existir pra ninguém.
DO $medicao$
DECLARE _res text; _ok boolean; _sobrou int;
BEGIN
  IF public.notif_nivel('mencao') <> 1 THEN
    RAISE EXCEPTION 'mencao não ficou no nível 1 — não vai virar push';
  END IF;
  IF public.notif_nivel('mensagem') <> 3 THEN
    RAISE EXCEPTION 'mensagem saiu do nível 3 — comentário solto voltaria a interromper';
  END IF;

  BEGIN
    DECLARE
      _ent uuid; _autor uuid; _marcado uuid; _fio uuid;
      _n_mencao int; _n_mensagem int; _dupla int;
    BEGIN
      -- Um entregável real e duas pessoas reais: o gatilho lê profiles e
      -- deliverables, então dado inventado não exercitaria o caminho.
      SELECT d.id INTO _ent FROM public.deliverables d
       WHERE d.project_id IS NOT NULL LIMIT 1;
      SELECT id INTO _autor   FROM public.profiles ORDER BY created_at LIMIT 1;
      SELECT id INTO _marcado FROM public.profiles WHERE id <> _autor ORDER BY created_at LIMIT 1;

      IF _ent IS NULL OR _autor IS NULL OR _marcado IS NULL THEN
        RAISE EXCEPTION 'RESULTADO:sem dado pra exercitar (entregavel/2 perfis)';
      END IF;

      INSERT INTO public.comments (entity_type, entity_id, user_id, body, mentions)
      VALUES ('deliverable', _ent, _autor, 'teste de menção — não deve persistir', ARRAY[_marcado])
      RETURNING id INTO _fio;

      -- O marcado recebeu menção nível 1...
      SELECT count(*) INTO _n_mencao FROM public.notificacoes
       WHERE user_id = _marcado AND tipo = 'mencao' AND nivel = 1
         AND created_at > now() - interval '1 minute';

      -- ...e NÃO recebeu o comentário genérico junto.
      SELECT count(*) INTO _dupla FROM public.notificacoes
       WHERE user_id = _marcado AND tipo = 'mensagem'
         AND created_at > now() - interval '1 minute';

      -- Quem não foi marcado segue no sino (0 aqui é legítimo: pode não haver
      -- outro participante no fio. O que não pode é virar push.)
      SELECT count(*) INTO _n_mensagem FROM public.notificacoes
       WHERE tipo = 'mensagem' AND nivel <> 3
         AND created_at > now() - interval '1 minute';

      _res := format('mencao=%s dupla=%s mensagem_fora_do_nivel3=%s', _n_mencao, _dupla, _n_mensagem);
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res LIKE 'sem dado%' THEN
    RAISE NOTICE 'menção: %  (gatilho não exercitado)', _res;
  ELSE
    IF _res NOT LIKE 'mencao=1 %' THEN
      RAISE EXCEPTION 'quem foi marcado não recebeu menção nível 1: %', _res;
    END IF;
    IF _res NOT LIKE '% dupla=0 %' THEN
      RAISE EXCEPTION 'o marcado recebeu menção E comentário — chegaria duas vezes: %', _res;
    END IF;
    IF _res NOT LIKE '% mensagem_fora_do_nivel3=0' THEN
      RAISE EXCEPTION 'comentário solto vazou pra um nível que empurra push: %', _res;
    END IF;
  END IF;

  -- E o teste não deixou rastro: o comentário inventado não existe.
  SELECT count(*) INTO _sobrou FROM public.comments
   WHERE body = 'teste de menção — não deve persistir';
  IF _sobrou > 0 THEN
    RAISE EXCEPTION 'o comentário de teste persistiu (% linha(s)) — a subtransação não desfez', _sobrou;
  END IF;

  RAISE NOTICE 'menção avisa (nível 1), comentário segue no sino (nível 3) — testado e desfeito: %', _res;
END $medicao$;
