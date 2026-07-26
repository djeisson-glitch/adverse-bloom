-- =========================================================================
-- Notificações: NÍVEIS + preferências por usuário.
--
-- O problema: hoje tudo que é 'critico' OU 'importante' dá push na hora. Como
-- quase todo evento nasce 'importante', o time é interrompido o dia inteiro,
-- aprende a ignorar, e aí o que importa de verdade (alteração do cliente)
-- se perde no meio. O objetivo aqui NÃO é notificar mais — é notificar menos.
--
-- Modelo de 3 níveis (propriedade do TIPO de evento, no catálogo abaixo):
--   1 = push na hora        — crítico, pode interromper
--   2 = push agrupado       — importante, junta e sai no resumo (9h/14h/17h)
--   3 = só no sino          — nunca vira push
--
-- E, por PESSOA, o modo de recebimento de cada tipo:
--   push | sino | off       — "alguns precisam de mais, outros de menos"
--
-- Nível decide QUANDO o push sai; o modo decide SE chega naquela pessoa.
-- Separar os dois é o que deixa o painel do admin simples de entender.
-- =========================================================================

-- ---- Catálogo de tipos ---------------------------------------------------
-- Fonte da verdade do que existe e de qual é o nível padrão de cada evento.
-- Existe como TABELA (e não como CASE no código) porque o admin precisa
-- reclassificar sem deploy.
CREATE TABLE IF NOT EXISTS public.notificacao_tipos (
  tipo         text PRIMARY KEY,
  rotulo       text NOT NULL,
  descricao    text,
  grupo        text NOT NULL DEFAULT 'geral',   -- producao | comercial | prazos | conversas | sistema
  nivel_padrao int  NOT NULL DEFAULT 3 CHECK (nivel_padrao IN (1, 2, 3)),
  ordem        int  NOT NULL DEFAULT 100
);

-- Os 15 eventos que existem hoje. Nível padrão pensado pra CORTAR volume:
-- só entra no nível 1 o que, se passar batido, custa dinheiro ou prazo.
INSERT INTO public.notificacao_tipos (tipo, rotulo, descricao, grupo, nivel_padrao, ordem) VALUES
  ('alteracao_solicitada', 'Cliente pediu alteração', 'O cliente pediu alteração pelo portal',   'producao',  1, 10),
  ('ajuste_solicitado',    'Ajuste do cliente',       'Entregável voltou como ajuste do cliente','producao',  1, 11),
  ('carta_aprovada',       'Proposta aprovada 🎉',    'O cliente aprovou a carta/proposta',      'comercial', 1, 12),
  ('prazo_hoje',           'Vence hoje',              'Entregável ou tarefa que vence hoje',     'prazos',    1, 13),
  ('prazo_atrasado',       'Atrasado',                'Passou do prazo e não entregou',          'prazos',    1, 14),
  ('digest',               'Seu dia (resumo da IA)',  'Resumo da manhã escrito pela IA',         'sistema',   1, 15),
  ('teste',                'Teste de notificação',    'Disparado pelo botão Testar',             'sistema',   1, 16),

  ('aguardando_aprovacao', 'Esperando seu ok',        'Entregável parado esperando sua revisão', 'producao',  2, 30),
  ('entregavel_atribuido', 'Novo vídeo pra você',     'Te colocaram como responsável',           'producao',  2, 31),
  ('tarefa_atribuida',     'Nova tarefa pra você',    'Te atribuíram uma tarefa',                'producao',  2, 32),
  ('demanda_nova',         'Nova demanda',            'Chegou demanda pelo formulário público',  'comercial', 2, 33),
  ('briefing_enviado',     'Briefing respondido',     'O cliente respondeu o briefing',          'comercial', 2, 34),
  ('prazo_amanha',         'Vence amanhã',            'Entregável ou tarefa que vence amanhã',   'prazos',    2, 35),

  ('mensagem',             'Comentário / mensagem',   'Comentário nos fios que você acompanha',  'conversas', 3, 50),
  ('entregavel_aprovado',  'Aprovado 🎉',             'Seu entregável foi aprovado',             'producao',  3, 51)
ON CONFLICT (tipo) DO NOTHING;

-- ---- Preferência por pessoa × tipo --------------------------------------
-- Linha ausente = usa o padrão do catálogo (nível 3 → sino; 1 e 2 → push).
-- Só grava quem foi explicitamente configurado, então o padrão continua
-- valendo pra quem nunca foi mexido.
CREATE TABLE IF NOT EXISTS public.notificacao_prefs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo    text NOT NULL REFERENCES public.notificacao_tipos(tipo) ON DELETE CASCADE,
  modo    text NOT NULL DEFAULT 'push' CHECK (modo IN ('push', 'sino', 'off')),
  PRIMARY KEY (user_id, tipo)
);

-- ---- Config geral por pessoa --------------------------------------------
CREATE TABLE IF NOT EXISTS public.notificacao_config (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_horas int[] NOT NULL DEFAULT '{9,14,17}',   -- hora local (BRT) dos resumos do nível 2
  dnd_ate      timestamptz,                          -- não perturbe até; nível 1 passa mesmo assim
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---- Colunas novas na tabela de notificações ----------------------------
-- nivel entra NULLABLE de propósito: o trigger abaixo resolve pelo catálogo.
-- Com DEFAULT 3 não daria pra distinguir "é nível 3" de "ninguém informou",
-- e o digest-diario (que insere direto, com service role) cairia em 3 e
-- pararia de empurrar o resumo da manhã.
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS nivel     int CHECK (nivel IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS group_key text;

-- ---- Resolvedores --------------------------------------------------------
/** Nível efetivo de um tipo (do catálogo; desconhecido = 3, nunca interrompe). */
CREATE OR REPLACE FUNCTION public.notif_nivel(_tipo text)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT t.nivel_padrao FROM public.notificacao_tipos t WHERE t.tipo = _tipo), 3)
$$;

/** Modo efetivo (push|sino|off) de um tipo pra uma pessoa. */
CREATE OR REPLACE FUNCTION public.notif_modo(_user_id uuid, _tipo text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT p.modo FROM public.notificacao_prefs p
      WHERE p.user_id = _user_id AND p.tipo = _tipo),
    -- Sem preferência gravada: nível 3 fica só no sino, 1 e 2 empurram.
    (SELECT CASE WHEN t.nivel_padrao = 3 THEN 'sino' ELSE 'push' END
       FROM public.notificacao_tipos t WHERE t.tipo = _tipo),
    'sino'   -- tipo desconhecido: nunca interrompe ninguém
  )
$$;

/**
 * Este push pode sair pra esta pessoa? É a "regra de ouro":
 *   1) o nível permite push?    (3 nunca)
 *   2) a pessoa quer este tipo? (modo push)
 *   3) está em não-perturbe?    (nível 1 passa mesmo assim)
 * O 4º filtro (agrupar por group_key) é do push-enviar, que precisa olhar o
 * conjunto de pendentes — não dá pra decidir linha a linha aqui.
 */
CREATE OR REPLACE FUNCTION public.pode_push(_user_id uuid, _tipo text, _nivel int)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _modo text; _dnd timestamptz;
BEGIN
  IF _nivel = 3 THEN RETURN false; END IF;

  _modo := public.notif_modo(_user_id, _tipo);
  IF _modo <> 'push' THEN RETURN false; END IF;

  IF _nivel = 1 THEN RETURN true; END IF;   -- crítico fura o não-perturbe

  SELECT c.dnd_ate INTO _dnd FROM public.notificacao_config c WHERE c.user_id = _user_id;
  RETURN _dnd IS NULL OR _dnd <= now();
END;
$$;

-- ---- Trigger que carimba nível e chave de grupo em QUALQUER insert -------
-- Vale pros gatilhos (via notificar()), pro digest-diario (insert direto com
-- service role) e pra qualquer caminho futuro. Um lugar só decide.
CREATE OR REPLACE FUNCTION public.tg_notif_classificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.nivel IS NULL THEN
    NEW.nivel := public.notif_nivel(NEW.tipo);
  END IF;
  -- Chave de agrupamento: agrupa por (tipo, projeto) lendo o uuid do próprio
  -- link. É o que transforma "5 alterações no mesmo projeto" em 1 push só,
  -- sem precisar mexer em cada gatilho.
  IF NEW.group_key IS NULL THEN
    NEW.group_key := NEW.tipo || ':' ||
      COALESCE(substring(COALESCE(NEW.link, '') from '/projetos/([0-9a-fA-F-]{36})'), 'geral');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notif_classificar ON public.notificacoes;
CREATE TRIGGER trg_notif_classificar
  BEFORE INSERT ON public.notificacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_classificar();

-- Backfill do que já está gravado (o trigger só vale daqui pra frente).
UPDATE public.notificacoes n
   SET nivel = public.notif_nivel(n.tipo),
       group_key = COALESCE(n.group_key, n.tipo || ':' ||
         COALESCE(substring(COALESCE(n.link, '') from '/projetos/([0-9a-fA-F-]{36})'), 'geral'))
 WHERE n.nivel IS NULL;

ALTER TABLE public.notificacoes ALTER COLUMN nivel SET NOT NULL;

-- O push pendente agora é buscado por NÍVEL, não por prioridade.
DROP INDEX IF EXISTS public.notificacoes_pendentes_push;
CREATE INDEX IF NOT EXISTS notificacoes_pendentes_push
  ON public.notificacoes (push_em, nivel) WHERE push_em IS NULL;
CREATE INDEX IF NOT EXISTS notificacoes_grupo
  ON public.notificacoes (user_id, group_key, created_at DESC) WHERE group_key IS NOT NULL;

-- ---- RLS -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pode_admin_notif(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'admin') OR public.has_role(_uid, 'manager')
$$;

ALTER TABLE public.notificacao_tipos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacao_prefs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacao_config ENABLE ROW LEVEL SECURITY;

-- Catálogo: todo mundo lê (a tela de preferências precisa dos rótulos);
-- só admin altera o nível de um tipo.
DROP POLICY IF EXISTS "tipos leitura" ON public.notificacao_tipos;
CREATE POLICY "tipos leitura" ON public.notificacao_tipos
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tipos admin" ON public.notificacao_tipos;
CREATE POLICY "tipos admin" ON public.notificacao_tipos
  FOR ALL TO authenticated
  USING (public.pode_admin_notif(auth.uid())) WITH CHECK (public.pode_admin_notif(auth.uid()));

-- Preferência: cada um mexe na sua; admin mexe na de todo mundo (é o painel).
DROP POLICY IF EXISTS "prefs propria ou admin" ON public.notificacao_prefs;
CREATE POLICY "prefs propria ou admin" ON public.notificacao_prefs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.pode_admin_notif(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.pode_admin_notif(auth.uid()));

DROP POLICY IF EXISTS "config propria ou admin" ON public.notificacao_config;
CREATE POLICY "config propria ou admin" ON public.notificacao_config
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.pode_admin_notif(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.pode_admin_notif(auth.uid()));

-- ---- notificar(): respeita 'off' e aceita chave de grupo explícita -------
-- A assinatura ganha _group_key com default, então as ~15 chamadas existentes
-- (7 argumentos) continuam válidas sem tocar em nenhum gatilho.
DROP FUNCTION IF EXISTS public.notificar(uuid, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.notificar(
  _user_id uuid, _tipo text, _prioridade text,
  _titulo text, _corpo text, _link text,
  _dedupe_key text DEFAULT NULL, _group_key text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;

  -- 'off' = a pessoa não quer este tipo nem no sino. Não cria a linha.
  IF public.notif_modo(_user_id, _tipo) = 'off' THEN RETURN; END IF;

  INSERT INTO public.notificacoes
    (user_id, tipo, prioridade, titulo, corpo, link, dedupe_key, group_key)
  VALUES
    (_user_id, _tipo, COALESCE(_prioridade, 'info'), _titulo, _corpo, _link, _dedupe_key, _group_key)
  ON CONFLICT DO NOTHING;   -- dedupe; o nível é carimbado pelo trigger
END;
$$;

-- ---- Push imediato: só o NÍVEL 1 acorda o navegador na hora -------------
-- Antes: qualquer 'critico' OU 'importante' disparava. Como quase tudo nasce
-- 'importante', era a origem da enxurrada. Nível 2 agora espera o resumo.
CREATE OR REPLACE FUNCTION public.tg_notif_push_imediato()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net AS $$
BEGIN
  IF NEW.nivel = 1 AND NEW.push_em IS NULL
     AND public.pode_push(NEW.user_id, NEW.tipo, NEW.nivel) THEN
    -- Uma chamada por transação (o lote diário de prazos cria dezenas de
    -- linhas de uma vez; o push-enviar já processa todas as pendentes).
    IF current_setting('adverse.push_fired', true) IS DISTINCT FROM '1' THEN
      PERFORM set_config('adverse.push_fired', '1', true);
      PERFORM net.http_post(
        url := 'https://ythmkxudzaoaayxxlgqy.supabase.co/functions/v1/push-enviar',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aG1reHVkemFvYWF5eHhsZ3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0MjAsImV4cCI6MjA5NTg4OTQyMH0.Iww1k1QUKqD1EUqi1d8CLSl0Erd_6VHkk3KWKaMowNI',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aG1reHVkemFvYWF5eHhsZ3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0MjAsImV4cCI6MjA5NTg4OTQyMH0.Iww1k1QUKqD1EUqi1d8CLSl0Erd_6VHkk3KWKaMowNI'
        ),
        body := '{}'::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

GRANT EXECUTE ON FUNCTION public.notif_modo(uuid, text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_nivel(text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_push(uuid, text, int)  TO authenticated;
