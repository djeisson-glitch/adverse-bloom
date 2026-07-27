-- =========================================================================
-- Espelho do bug anterior: o EDITOR não era avisado quando a peça voltava.
--
-- Contexto: o Djêisson esclareceu que o Robert atua como editor. Isso mudou
-- onde procurar — e o outro lado do fluxo tinha o mesmo buraco.
--
-- Quando R1/R2 pede ajuste, a peça vai pra `ajuste_interno`. O gatilho
-- tg_notif_deliverable não tinha ramo pra esse status. A única coisa que
-- acontecia era o anotarAjuste() inserir um COMENTÁRIO — que vira notificação
-- do tipo `mensagem`, nível 3: só no sino, nunca empurra.
--
-- Resultado: o editor tinha que ficar entrando pra conferir se voltou algo.
-- Exatamente a reclamação, vista do lado de quem edita.
--
-- Simetria que faltava:
--   editor manda   -> revisor avisado   (corrigido na migration anterior)
--   revisor devolve -> editor avisado   (esta)
-- =========================================================================

-- Tipo novo no catálogo. Nível 1: peça voltando é trabalho parado esperando
-- a pessoa — é o gêmeo do "esperando seu ok" do outro lado.
INSERT INTO public.notificacao_tipos (tipo, rotulo, descricao, grupo, nivel_padrao, ordem)
VALUES ('ajuste_interno', 'Voltou pra você', 'A revisão pediu ajuste na sua peça', 'producao', 1, 17)
ON CONFLICT (tipo) DO UPDATE SET nivel_padrao = 1, rotulo = EXCLUDED.rotulo, descricao = EXCLUDED.descricao;

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

    -- Revisão única (retrabalho): todo reenvio depois de um ajuste passa aqui.
    ELSIF NEW.status = 'revisao' THEN
      aprov := public.aprovador_efetivo(NEW.project_id, 1);
      PERFORM public.notificar(aprov, 'aguardando_aprovacao', 'importante',
        'Voltou pra revisão', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'rev:' || NEW.id::text || ':' || coalesce(NEW.revisoes_internas, 0)::text);

    -- A PEÇA VOLTOU PRO EDITOR. Era o ramo que faltava: antes só saía um
    -- comentário (nível 3, sem push) e a pessoa tinha que conferir na mão.
    -- O contador de revisões no dedupe garante que o 2º e o 3º retorno da
    -- mesma peça também avisem.
    ELSIF NEW.status = 'ajuste_interno' AND NEW.responsavel_id IS NOT NULL THEN
      PERFORM public.notificar(NEW.responsavel_id, 'ajuste_interno', 'critico',
        'Voltou pra você', NEW.titulo || coalesce(' · ' || proj, '') || ' — ver os ajustes no Frame.io',
        link, 'ajint:' || NEW.id::text || ':' || coalesce(NEW.revisoes_internas, 0)::text);

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
