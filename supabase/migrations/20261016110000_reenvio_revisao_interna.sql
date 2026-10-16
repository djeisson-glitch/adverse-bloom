-- Uma fila por peça, inclusive em clientes antigos e correções administrativas.
BEGIN;

CREATE OR REPLACE FUNCTION public.tg_revisao_interna_unica()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('revisao', 'revisao_n2') THEN NEW.status := 'revisao_n1'; END IF;
  IF NEW.status = 'revisao_n1' THEN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.rev_ajuste_pendente := false;
      NEW.rev_n1_ajuste := false;
      NEW.rev_n2_ajuste := false;
    END IF;
  END IF;
  -- Preserva os carimbos históricos. A interface considera o status atual.
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_notif_deliverable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proj text;
  link text;
  aprov uuid;
  -- Uma chave por transição real, sem colisão em reenvios no mesmo segundo.
  rod text := gen_random_uuid()::text;
BEGIN
  SELECT p.name INTO proj FROM public.projects p WHERE p.id = NEW.project_id;
  link := '/projetos/' || NEW.project_id || '/entregaveis/' || NEW.id;

  IF NEW.responsavel_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id) THEN
    PERFORM public.notificar(NEW.responsavel_id, 'entregavel_atribuido', 'importante',
      'Novo vídeo pra você', NEW.titulo || coalesce(' · ' || proj, ''),
      link, 'atrib:' || NEW.id::text || ':' || NEW.responsavel_id::text || ':' || rod);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('revisao_n1', 'revisao', 'revisao_n2') THEN
      aprov := public.aprovador_efetivo(NEW.project_id, 1);
      PERFORM public.notificar(aprov, 'aguardando_aprovacao', 'importante',
        CASE WHEN coalesce(NEW.retrabalho, false) THEN 'Refeito — esperando seu ok'
             ELSE 'Esperando seu ok' END,
        NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'aprov1:' || NEW.id::text || ':' || rod);
    ELSIF NEW.status = 'ajuste_solicitado' THEN
      PERFORM public.notificar(NEW.responsavel_id, 'ajuste_solicitado', 'critico',
        'Pediram alteração', NEW.titulo || coalesce(' · ' || proj, ''),
        link, 'ajuste:' || NEW.id::text || ':' || rod);
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
END $$;

-- Quem já aguardava revisão na fila antiga passa à única fila e recebe aviso.
-- Não mexe em peças em edição, em ajuste, com cliente ou já entregues.
UPDATE public.deliverables SET status = 'revisao_n1'
 WHERE status IN ('revisao', 'revisao_n2');

COMMIT;
