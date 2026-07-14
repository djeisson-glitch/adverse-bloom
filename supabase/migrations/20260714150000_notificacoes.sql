-- =========================================================================
-- Notificações — base
--
--  Fonte da verdade é o BANCO, não o front: metade dos eventos mais
--  importantes acontece SEM ninguém logado (o cliente aprova a carta às 22h,
--  pede alteração pelo portal, manda o briefing, envia demanda pelo
--  formulário). Gatilho no React perderia todos esses.
--
--  Prioridade decide o canal:
--    critico    -> push na hora (e sino)
--    importante -> push na hora (e sino)
--    info       -> só o sino; entra no digest da manhã
--
--  dedupe_key: a mesma coisa nunca notifica duas vezes.
-- =========================================================================

-- ---- Notificações -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo        text NOT NULL,                    -- alteracao_solicitada, carta_aprovada, ...
  prioridade  text NOT NULL DEFAULT 'info',     -- critico | importante | info
  titulo      text NOT NULL,
  corpo       text,
  link        text,                             -- pra onde levar quando clicar
  dedupe_key  text,                             -- mesma chave = não repete
  lida_em     timestamptz,
  push_em     timestamptz,                      -- já saiu no push?
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Dedupe: uma notificação por (pessoa, chave).
CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_dedupe
  ON public.notificacoes (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notificacoes_caixa
  ON public.notificacoes (user_id, lida_em, created_at DESC);
CREATE INDEX IF NOT EXISTS notificacoes_pendentes_push
  ON public.notificacoes (push_em, prioridade) WHERE push_em IS NULL;

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif own read" ON public.notificacoes;
CREATE POLICY "notif own read" ON public.notificacoes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notif own update" ON public.notificacoes;
CREATE POLICY "notif own update" ON public.notificacoes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- INSERT só via SECURITY DEFINER (os triggers). Ninguém cria notificação à mão.

-- Sino em tempo real
ALTER TABLE public.notificacoes REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
EXCEPTION WHEN OTHERS THEN
  NULL;   -- já está na publicação
END $$;

-- ---- Assinaturas de Web Push (uma por navegador/dispositivo) ------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subs_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push own" ON public.push_subscriptions;
CREATE POLICY "push own" ON public.push_subscriptions
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---- Helpers ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notificar(
  _user_id uuid, _tipo text, _prioridade text,
  _titulo text, _corpo text, _link text, _dedupe_key text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notificacoes (user_id, tipo, prioridade, titulo, corpo, link, dedupe_key)
  VALUES (_user_id, _tipo, coalesce(_prioridade, 'info'), _titulo, _corpo, _link, _dedupe_key)
  ON CONFLICT DO NOTHING;   -- dedupe
END;
$$;

/** Manda pra todo mundo da gestão (admin/produtor). */
CREATE OR REPLACE FUNCTION public.notificar_gestao(
  _tipo text, _prioridade text, _titulo text, _corpo text, _link text, _dedupe_key text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid;
BEGIN
  FOR u IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
     WHERE ur.role::text IN ('admin', 'manager', 'produtor')
  LOOP
    PERFORM public.notificar(u, _tipo, _prioridade, _titulo, _corpo, _link, _dedupe_key);
  END LOOP;
END;
$$;

/** Aprovador efetivo do entregável (override do projeto > padrão global). */
CREATE OR REPLACE FUNCTION public.aprovador_efetivo(_project_id uuid, _nivel int)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _nivel = 1
    THEN coalesce(p.aprovador_n1_id, (SELECT nivel1_user_id FROM public.approval_settings WHERE id))
    ELSE coalesce(p.aprovador_n2_id, (SELECT nivel2_user_id FROM public.approval_settings WHERE id))
  END
  FROM public.projects p WHERE p.id = _project_id;
$$;

-- ---- Gatilho: entregáveis ----------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_notif_deliverable()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proj text;
  link text;
  aprov uuid;
BEGIN
  SELECT p.name INTO proj FROM public.projects p WHERE p.id = NEW.project_id;
  link := '/projetos/' || NEW.project_id || '/entregaveis/' || NEW.id;

  -- Atribuíram um vídeo pra você
  IF NEW.responsavel_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id) THEN
    PERFORM public.notificar(
      NEW.responsavel_id, 'entregavel_atribuido', 'importante',
      'Novo vídeo pra você',
      NEW.titulo || coalesce(' · ' || proj, ''),
      link, 'atrib:' || NEW.id::text || ':' || NEW.responsavel_id::text);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Esperando aprovação (N1/N2)
    IF NEW.status = 'revisao_n1' THEN
      aprov := public.aprovador_efetivo(NEW.project_id, 1);
      PERFORM public.notificar(aprov, 'aguardando_aprovacao', 'importante',
        'Esperando seu ok', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'aprov1:' || NEW.id::text);
    ELSIF NEW.status = 'revisao_n2' THEN
      aprov := public.aprovador_efetivo(NEW.project_id, 2);
      PERFORM public.notificar(aprov, 'aguardando_aprovacao', 'importante',
        'Esperando seu ok (N2)', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'aprov2:' || NEW.id::text);

    -- Cliente pediu ajuste — é o que mais dói se passar batido
    ELSIF NEW.status = 'ajuste_solicitado' THEN
      PERFORM public.notificar(NEW.responsavel_id, 'ajuste_solicitado', 'critico',
        'Pediram alteração', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'ajuste:' || NEW.id::text || ':' || coalesce(NEW.updated_at, now())::text);

    ELSIF NEW.status = 'aprovado' THEN
      PERFORM public.notificar(NEW.responsavel_id, 'entregavel_aprovado', 'info',
        'Aprovado 🎉', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'aprovado:' || NEW.id::text);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_deliverable ON public.deliverables;
CREATE TRIGGER trg_notif_deliverable
  AFTER INSERT OR UPDATE ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_deliverable();

-- ---- Gatilho: alteração pedida pelo cliente (portal) --------------------
CREATE OR REPLACE FUNCTION public.tg_notif_alteracao()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; proj text;
BEGIN
  SELECT dd.id, dd.titulo, dd.project_id, dd.responsavel_id INTO d
    FROM public.deliverables dd WHERE dd.id = NEW.deliverable_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT p.name INTO proj FROM public.projects p WHERE p.id = d.project_id;

  PERFORM public.notificar(
    coalesce(NEW.responsavel_id, d.responsavel_id),
    'alteracao_solicitada', 'critico',
    'Alteração pedida (R' || NEW.numero || ')',
    d.titulo || coalesce(' · ' || proj, '') || coalesce(E'\n' || NEW.titulo, ''),
    '/projetos/' || d.project_id || '/entregaveis/' || d.id,
    'alt:' || NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_alteracao ON public.deliverable_alteracoes;
CREATE TRIGGER trg_notif_alteracao
  AFTER INSERT ON public.deliverable_alteracoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_alteracao();

-- ---- Gatilho: tarefa atribuída -----------------------------------------
CREATE OR REPLACE FUNCTION public.tg_notif_task()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE proj text;
BEGIN
  IF NEW.assigned_user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id THEN
    RETURN NEW;
  END IF;
  IF coalesce(NEW.completed, false) THEN RETURN NEW; END IF;

  SELECT p.name INTO proj FROM public.projects p WHERE p.id = NEW.project_id;
  PERFORM public.notificar(
    NEW.assigned_user_id, 'tarefa_atribuida', 'importante',
    'Nova tarefa pra você', NEW.title || coalesce(' · ' || proj, ''),
    CASE WHEN NEW.project_id IS NOT NULL THEN '/projetos/' || NEW.project_id ELSE '/minha-mesa' END,
    'task:' || NEW.id::text || ':' || NEW.assigned_user_id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_task ON public.tasks;
CREATE TRIGGER trg_notif_task
  AFTER INSERT OR UPDATE OF assigned_user_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_task();

-- ---- Gatilho: CLIENTE APROVOU A CARTA (o mais importante de todos) ------
CREATE OR REPLACE FUNCTION public.tg_notif_carta_aprovada()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE quem text; titulo_deal text;
BEGIN
  IF NEW.aprovada_em IS NULL OR (TG_OP = 'UPDATE' AND OLD.aprovada_em IS NOT NULL) THEN
    RETURN NEW;   -- só na transição pra aprovada
  END IF;
  quem := coalesce(NEW.aprovada_por->>'nome', 'o cliente');
  SELECT d.title INTO titulo_deal FROM public.deals d WHERE d.id = NEW.deal_id;

  PERFORM public.notificar_gestao(
    'carta_aprovada', 'critico',
    '🎉 Proposta aprovada!',
    quem || ' aprovou' || coalesce(' — ' || titulo_deal, ''),
    CASE WHEN NEW.deal_id IS NOT NULL THEN '/orcamentos/' || NEW.deal_id ELSE '/orcamentos' END,
    'carta:' || NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_carta_aprovada ON public.budgets;
CREATE TRIGGER trg_notif_carta_aprovada
  AFTER INSERT OR UPDATE OF aprovada_em ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_carta_aprovada();

-- ---- Gatilho: demanda nova pelo formulário ------------------------------
CREATE OR REPLACE FUNCTION public.tg_notif_demanda()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cli text;
BEGIN
  SELECT c.name INTO cli FROM public.clients c WHERE c.id = NEW.client_id;
  PERFORM public.notificar_gestao(
    'demanda_nova', 'importante',
    'Nova demanda' || coalesce(' — ' || cli, ''),
    NEW.nome_projeto || ' · ' || NEW.solicitante_nome,
    '/demandas', 'demanda:' || NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_demanda ON public.demandas;
CREATE TRIGGER trg_notif_demanda
  AFTER INSERT ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_demanda();

-- ---- Gatilho: cliente enviou o briefing ---------------------------------
CREATE OR REPLACE FUNCTION public.tg_notif_briefing()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.mergulho_enviado_em IS NULL
     OR (TG_OP = 'UPDATE' AND OLD.mergulho_enviado_em IS NOT DISTINCT FROM NEW.mergulho_enviado_em) THEN
    RETURN NEW;
  END IF;
  PERFORM public.notificar_gestao(
    'briefing_enviado', 'importante',
    'Briefing respondido',
    coalesce(NEW.title, 'projeto') || ' — o cliente enviou o briefing',
    '/orcamentos/' || NEW.id, 'briefing:' || NEW.id::text || ':' || NEW.mergulho_enviado_em::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_briefing ON public.deals;
CREATE TRIGGER trg_notif_briefing
  AFTER UPDATE OF mergulho_enviado_em ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_briefing();

-- ---- Marcar como lida (RPC de conveniência) -----------------------------
CREATE OR REPLACE FUNCTION public.notificacoes_marcar_lidas(_ids uuid[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notificacoes
     SET lida_em = now()
   WHERE user_id = auth.uid()
     AND lida_em IS NULL
     AND (_ids IS NULL OR id = ANY(_ids));
END;
$$;

GRANT EXECUTE ON FUNCTION public.notificacoes_marcar_lidas(uuid[]) TO authenticated;
