-- =========================================================================
-- Bug: reenvio pra revisão não avisava ninguém.
--
-- Relato do Robert: "não estou recebendo notificação quando os editores
-- enviam NOVAMENTE pra revisão os vídeos — o Zé ajustou e não recebi".
--
-- Causa: enviarParaRevisao() manda pra `revisao_n1` na primeira vez, mas pra
-- `revisao` quando a peça é RETRABALHO (já teve ajuste) — que é a revisão
-- única. E o gatilho tg_notif_deliverable só tinha ramo pra revisao_n1,
-- revisao_n2, ajuste_solicitado e aprovado. O status `revisao` não existia
-- ali: nenhuma notificação era criada.
--
-- Ou seja: a PRIMEIRA ida pra revisão avisava, a REPETIÇÃO não. Era
-- exatamente o "enviam novamente" do relato.
-- =========================================================================

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
    -- Esperando aprovação (R1/R2)
    IF NEW.status = 'revisao_n1' THEN
      aprov := public.aprovador_efetivo(NEW.project_id, 1);
      PERFORM public.notificar(aprov, 'aguardando_aprovacao', 'importante',
        'Esperando seu ok', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'aprov1:' || NEW.id::text);
    ELSIF NEW.status = 'revisao_n2' THEN
      aprov := public.aprovador_efetivo(NEW.project_id, 2);
      PERFORM public.notificar(aprov, 'aguardando_aprovacao', 'importante',
        'Esperando seu ok (R2)', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'aprov2:' || NEW.id::text);

    -- REVISÃO ÚNICA (retrabalho): era o ramo que faltava. A peça volta pro
    -- revisor 1 e ele precisa saber — é a segunda ida, não a primeira.
    -- O dedupe_key carrega o contador de revisões: sem isso, o 2º e o 3º
    -- reenvio da MESMA peça colidiriam com o 1º e sumiriam calados.
    ELSIF NEW.status = 'revisao' THEN
      aprov := public.aprovador_efetivo(NEW.project_id, 1);
      PERFORM public.notificar(aprov, 'aguardando_aprovacao', 'importante',
        'Voltou pra revisão', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'rev:' || NEW.id::text || ':' || coalesce(NEW.revisoes_internas, 0)::text);

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

-- "Esperando seu ok" trava o editor: ele mandou e não pode seguir. Esperar o
-- resumo das 9/14/17h pra avisar é o que faz o time achar que o sistema não
-- funciona. Sobe pra nível 1.
UPDATE public.notificacao_tipos
   SET nivel_padrao = 1,
       descricao = 'Entregável parado esperando sua revisão — trava o editor'
 WHERE tipo = 'aguardando_aprovacao';

UPDATE public.notificacoes
   SET nivel = 1
 WHERE tipo = 'aguardando_aprovacao' AND push_em IS NULL;
