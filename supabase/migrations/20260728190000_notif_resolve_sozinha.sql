-- =========================================================================
-- Notificação de AÇÃO se resolve quando a ação acontece.
--
-- Hoje ela só sai do sininho se a pessoa clicar em "marcar como lida". Quem
-- resolve a peça pela Minha mesa deixa pra trás uma cobrança que não vale
-- mais. Medido em 28/07/2026 na caixa do Djêisson: 8 das 13 notificações de
-- ação já estavam vencidas — a peça tinha saído do estado e o sino continuava
-- pedindo.
--
-- Resolver no BANCO e não na tela: quem muda o status é a Minha mesa, a ficha
-- do entregável, o portal do cliente e o "corrigir etapa" do admin. Tratar na
-- tela deixaria os outros caminhos de fora.
--
-- Além de marcar como lida, LIMPA o dedupe_key. Isso conserta um segundo bug,
-- que não era o pedido: notificar() usa ON CONFLICT DO NOTHING sobre
-- (user_id, dedupe_key), e chaves sem contador — 'aprov1:<id>', 'aprov2:<id>'
-- — faziam a SEGUNDA ida da mesma peça pra R1/R2 ser engolida em silêncio.
-- Com a chave liberada ao resolver, o próximo ciclo avisa de novo.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_notif_resolver_entregavel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _link text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  _link := '/projetos/' || NEW.project_id || '/entregaveis/' || NEW.id;

  UPDATE public.notificacoes n
     SET lida_em = now(), dedupe_key = NULL
   WHERE n.lida_em IS NULL
     AND n.link = _link
     AND (
       -- Aprovação: cada nível morre quando a peça sai DAQUELE nível. Pelo
       -- prefixo da chave, senão R1 sobreviveria à ida pra R2 — e o R1 já fez
       -- a parte dele.
          (n.dedupe_key LIKE 'aprov1:%' AND NEW.status <> 'revisao_n1')
       OR (n.dedupe_key LIKE 'aprov2:%' AND NEW.status <> 'revisao_n2')
       OR (n.dedupe_key LIKE 'rev:%'    AND NEW.status <> 'revisao')
       -- Linhas antigas sem chave: cai pro tipo.
       OR (n.dedupe_key IS NULL AND n.tipo = 'aguardando_aprovacao'
           AND NEW.status NOT IN ('revisao', 'revisao_n1', 'revisao_n2'))

       OR (n.tipo = 'ajuste_interno'       AND NEW.status <> 'ajuste_interno')
       OR (n.tipo = 'ajuste_solicitado'    AND NEW.status <> 'ajuste_solicitado')
       OR (n.tipo = 'entregavel_atribuido' AND NEW.status <> 'pendente')
       -- Aviso de prazo: some quando não há mais nada a fazer do nosso lado.
       OR (n.tipo IN ('prazo_hoje', 'prazo_atrasado')
           AND NEW.status IN ('com_cliente', 'aprovado', 'entregue', 'faturado', 'cancelado'))
     );

  RETURN NEW;
END $$;

-- BEFORE: o trigger que CRIA a notificação do novo status é AFTER. Assim o
-- aviso novo nasce depois da faxina e não é apagado junto.
DROP TRIGGER IF EXISTS trg_notif_resolver_entregavel ON public.deliverables;
CREATE TRIGGER trg_notif_resolver_entregavel
  BEFORE UPDATE OF status ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_resolver_entregavel();

-- ---- Alteração do cliente: fechou, sai do sino ---------------------------
CREATE OR REPLACE FUNCTION public.tg_notif_resolver_alteracao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'aberta' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  UPDATE public.notificacoes
     SET lida_em = now(), dedupe_key = NULL
   WHERE lida_em IS NULL AND dedupe_key = 'alt:' || NEW.id::text;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notif_resolver_alteracao ON public.deliverable_alteracoes;
CREATE TRIGGER trg_notif_resolver_alteracao
  BEFORE UPDATE OF status ON public.deliverable_alteracoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_resolver_alteracao();

-- ---- Tarefa concluída ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_notif_resolver_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT NEW.completed OR OLD.completed THEN RETURN NEW; END IF;
  UPDATE public.notificacoes
     SET lida_em = now(), dedupe_key = NULL
   WHERE lida_em IS NULL
     AND (dedupe_key LIKE 'task_atraso:' || NEW.id::text || '%'
       OR dedupe_key LIKE 'task_hoje:'   || NEW.id::text || '%');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notif_resolver_tarefa ON public.tasks;
CREATE TRIGGER trg_notif_resolver_tarefa
  BEFORE UPDATE OF completed ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_resolver_tarefa();

-- ---- Faxina do que já está vencido hoje ---------------------------------
-- O trigger só pega dali pra frente. Sem isto, a caixa continuaria com a
-- cobrança velha e pareceria que nada mudou.
UPDATE public.notificacoes n
   SET lida_em = now(), dedupe_key = NULL
  FROM public.deliverables d
 WHERE n.lida_em IS NULL
   AND n.link = '/projetos/' || d.project_id || '/entregaveis/' || d.id
   AND (
        (n.dedupe_key LIKE 'aprov1:%' AND d.status <> 'revisao_n1')
     OR (n.dedupe_key LIKE 'aprov2:%' AND d.status <> 'revisao_n2')
     OR (n.dedupe_key LIKE 'rev:%'    AND d.status <> 'revisao')
     OR (n.dedupe_key IS NULL AND n.tipo = 'aguardando_aprovacao'
         AND d.status NOT IN ('revisao', 'revisao_n1', 'revisao_n2'))
     OR (n.tipo = 'ajuste_interno'       AND d.status <> 'ajuste_interno')
     OR (n.tipo = 'ajuste_solicitado'    AND d.status <> 'ajuste_solicitado')
     OR (n.tipo = 'entregavel_atribuido' AND d.status <> 'pendente')
     OR (n.tipo IN ('prazo_hoje', 'prazo_atrasado')
         AND d.status IN ('com_cliente', 'aprovado', 'entregue', 'faturado', 'cancelado'))
   );

UPDATE public.notificacoes n
   SET lida_em = now(), dedupe_key = NULL
  FROM public.deliverable_alteracoes a
 WHERE n.lida_em IS NULL
   AND n.dedupe_key = 'alt:' || a.id::text
   AND a.status <> 'aberta';
