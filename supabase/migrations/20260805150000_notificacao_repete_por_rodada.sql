-- =========================================================================
-- A notificação de revisão só chegava UMA VEZ NA VIDA da peça
--
-- Relato da Julia: "não recebi notificação que voltou pra minha revisão, eu
-- que fui lá ver se tu já tinha refeito".
--
-- A CAUSA: a chave de deduplicação era `aprov1:<id_da_peça>`, sem nada que
-- diferenciasse uma ida à revisão da outra. O `notificar()` tem índice único
-- (user_id, dedupe_key) com ON CONFLICT DO NOTHING — proteção contra
-- repetição que aqui virou proteção contra AVISAR:
--
--   1. peça vai pra revisão N1  → notifica          (chave aprov1:abc)
--   2. revisor pede ajuste      → volta pro editor
--   3. editor refaz e reenvia   → MESMA chave aprov1:abc → descartado
--
-- Do passo 3 em diante ninguém nunca mais é avisado daquela peça. E o ciclo
-- editar → revisar → ajustar → revisar é a rotina, não a exceção: por isso a
-- sensação de que "as notificações não funcionam" sem nunca achar o culpado.
--
-- O `ajuste_solicitado` já fazia certo — `ajuste:<id>:<updated_at>` — e é por
-- isso que o aviso de ajuste do cliente chegava sempre. A diferença estava
-- ali, em uma linha, desde o começo.
--
-- CORREÇÃO: toda notificação que pode acontecer mais de uma vez na vida da
-- peça ganha o instante da transição na chave. A dedup continua fazendo o
-- trabalho dela (barrar o mesmo evento repetido no mesmo instante, ex.: dois
-- updates simultâneos ou quem acumula papéis) e para de barrar rodada nova.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_notif_deliverable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proj  text;
  link  text;
  aprov uuid;
  -- Discriminador da rodada. Sem ele, "voltou pra sua revisão" é um evento
  -- único por peça — e a segunda volta é silêncio.
  rod   text := to_char(coalesce(NEW.updated_at, now()), 'YYYYMMDDHH24MISS');
BEGIN
  SELECT p.name INTO proj FROM public.projects p WHERE p.id = NEW.project_id;
  link := '/projetos/' || NEW.project_id || '/entregaveis/' || NEW.id;

  -- Atribuíram um vídeo pra você. Também precisa da rodada: passar a peça pro
  -- José e depois devolver pro Robert tinha que avisar o Robert de novo.
  IF NEW.responsavel_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id) THEN
    PERFORM public.notificar(
      NEW.responsavel_id, 'entregavel_atribuido', 'importante',
      'Novo vídeo pra você',
      NEW.titulo || coalesce(' · ' || proj, ''),
      link, 'atrib:' || NEW.id::text || ':' || NEW.responsavel_id::text || ':' || rod);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'revisao_n1' THEN
      aprov := public.aprovador_efetivo(NEW.project_id, 1);
      PERFORM public.notificar(aprov, 'aguardando_aprovacao', 'importante',
        -- Diz que é REENVIO quando a peça já tinha passado por ajuste: o
        -- revisor precisa saber que é a segunda leitura, não a primeira.
        CASE WHEN OLD.status IN ('ajuste_interno', 'ajuste_solicitado', 'em_edicao')
               AND coalesce(NEW.retrabalho, false)
             THEN 'Refeito — esperando seu ok'
             ELSE 'Esperando seu ok' END,
        NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'aprov1:' || NEW.id::text || ':' || rod);

    ELSIF NEW.status = 'revisao_n2' THEN
      aprov := public.aprovador_efetivo(NEW.project_id, 2);
      PERFORM public.notificar(aprov, 'aguardando_aprovacao', 'importante',
        'Esperando seu ok (N2)', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'aprov2:' || NEW.id::text || ':' || rod);

    ELSIF NEW.status = 'ajuste_solicitado' THEN
      PERFORM public.notificar(NEW.responsavel_id, 'ajuste_solicitado', 'critico',
        'Pediram alteração', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'ajuste:' || NEW.id::text || ':' || rod);

    -- Ajuste INTERNO (revisor devolveu) — o editor precisa saber, e isto não
    -- existia aqui: o aviso vinha de outro trigger ou não vinha.
    ELSIF NEW.status = 'ajuste_interno' THEN
      PERFORM public.notificar(NEW.responsavel_id, 'ajuste_interno', 'critico',
        'Voltou pra você', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'ajusteint:' || NEW.id::text || ':' || rod);

    ELSIF NEW.status = 'aprovado' THEN
      PERFORM public.notificar(NEW.responsavel_id, 'entregavel_aprovado', 'info',
        'Aprovado 🎉', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'aprovado:' || NEW.id::text || ':' || rod);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_deliverable ON public.deliverables;
CREATE TRIGGER trg_notif_deliverable
  AFTER INSERT OR UPDATE ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_deliverable();

-- O tipo precisa existir no catálogo, senão o roteador de nível não sabe o
-- que fazer com ele e a notificação pode não virar push.
INSERT INTO public.notificacao_tipos (tipo, rotulo, descricao, grupo, nivel_padrao, ordem)
VALUES ('ajuste_interno', 'Voltou pra você',
        'A revisão devolveu a peça pra ajuste', 'producao', 1, 55)
ON CONFLICT (tipo) DO NOTHING;

-- ---------------------------------------------------------------- medição
DO $$
DECLARE
  pecas_com_volta int;
  notifs          int;
BEGIN
  -- Quantas peças passaram por ajuste E estão/estiveram em revisão: cada uma
  -- dessas é uma volta que deveria ter avisado alguém.
  SELECT count(*) INTO pecas_com_volta
    FROM public.deliverables
   WHERE coalesce(retrabalho, false) IS TRUE;

  SELECT count(*) INTO notifs
    FROM public.notificacoes
   WHERE tipo = 'aguardando_aprovacao';

  RAISE NOTICE 'peças que já voltaram pra ajuste: % | notificações de "esperando ok" existentes: %',
    pecas_com_volta, notifs;
END $$;
