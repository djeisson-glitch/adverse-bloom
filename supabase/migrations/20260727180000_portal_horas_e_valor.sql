-- =========================================================================
-- Portal do cliente: horas, valor do mês, tipo de projeto e aviso de aprovação.
--
-- Pedido do Djêisson:
--   • cliente com mais de um tipo de projeto rodando -> separar no portal;
--   • horas usadas, multiplicadas por um fator que cobre revisão e
--     organização de arquivo (tempo real que não é rastreado). O portal mostra
--     SÓ o número final — o fator não aparece pro cliente;
--   • valor já faturado no mês, contando apenas vídeo FINALIZADO;
--   • aprovação do cliente tem que avisar o time.
-- =========================================================================

-- ---- Fator de horas, por cliente ---------------------------------------
-- Configurável (e não constante no código) porque muda por contrato — e daqui
-- a seis meses ninguém lembraria onde está um 1.3 chumbado.
ALTER TABLE public.client_faturamento
  ADD COLUMN IF NOT EXISTS fator_horas numeric(4,2) NOT NULL DEFAULT 1.30;

COMMENT ON COLUMN public.client_faturamento.fator_horas IS
  'Multiplicador das horas rastreadas pro portal/cobrança: cobre revisão e organização de arquivo, que não são apontadas. NÃO é exibido ao cliente — só o resultado.';

-- ---- Aprovação do cliente avisa o time ---------------------------------
-- Antes, aprovar no portal só mudava o status; a notificação que sobrava era
-- 'entregavel_aprovado' em nível 3 (só no sino). Fechar um vídeo com o cliente
-- é notícia, não rodapé.
CREATE OR REPLACE FUNCTION public.tg_notif_cliente_aprovou()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE proj text; cli text;
BEGIN
  IF NEW.aprovado_cliente_em IS NULL
     OR (TG_OP = 'UPDATE' AND OLD.aprovado_cliente_em IS NOT DISTINCT FROM NEW.aprovado_cliente_em) THEN
    RETURN NEW;
  END IF;

  SELECT p.name, p.client_name INTO proj, cli
    FROM public.projects p WHERE p.id = NEW.project_id;

  -- Vai pro responsável E pra gestão: quem editou quer saber que fechou, e
  -- quem coordena precisa pra faturar.
  PERFORM public.notificar(NEW.responsavel_id, 'cliente_aprovou', 'importante',
    'Cliente aprovou ✅', NEW.titulo || coalesce(' · ' || cli, ''),
    '/projetos/' || NEW.project_id || '/entregaveis/' || NEW.id,
    'cliaprov:' || NEW.id::text);
  PERFORM public.notificar_gestao('cliente_aprovou', 'importante',
    'Cliente aprovou ✅', NEW.titulo || coalesce(' · ' || cli, ''),
    '/projetos/' || NEW.project_id || '/entregaveis/' || NEW.id,
    'cliaprovg:' || NEW.id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notif_cliente_aprovou ON public.deliverables;
CREATE TRIGGER trg_notif_cliente_aprovou
  AFTER UPDATE OF aprovado_cliente_em ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_notif_cliente_aprovou();

INSERT INTO public.notificacao_tipos (tipo, rotulo, descricao, grupo, nivel_padrao, ordem)
VALUES ('cliente_aprovou', 'Cliente aprovou', 'O cliente aprovou a peça no portal', 'producao', 1, 18)
ON CONFLICT (tipo) DO UPDATE SET nivel_padrao = 1, rotulo = EXCLUDED.rotulo;

-- ---- Dados do portal ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_client_data(_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid uuid;
  cliente jsonb;
  projetos jsonb;
  entregaveis jsonb;
  _fator numeric;
  _valor_hora numeric;
  _ini date;
  _horas_mes numeric;
  _valor_mes numeric;
BEGIN
  SELECT client_id INTO cid
    FROM public.client_portal_tokens
    WHERE token = _token AND ativo = true
      AND (expires_at IS NULL OR expires_at > now());

  IF cid IS NULL THEN
    RETURN jsonb_build_object('error', 'token inválido ou expirado');
  END IF;

  UPDATE public.client_portal_tokens SET ultimo_acesso = now() WHERE token = _token;

  SELECT jsonb_build_object('id', id, 'name', name) INTO cliente
    FROM public.clients WHERE id = cid;

  -- Fator e valor-hora do cliente. Sem configuração, fator 1.3 e valor 0 —
  -- aí o portal simplesmente não mostra dinheiro (ver abaixo).
  SELECT COALESCE(cf.fator_horas, 1.30), COALESCE(cf.valor_hora, 0)
    INTO _fator, _valor_hora
    FROM public.client_faturamento cf WHERE cf.client_id = cid;
  _fator := COALESCE(_fator, 1.30);
  _valor_hora := COALESCE(_valor_hora, 0);
  _ini := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'numero', p.numero, 'name', p.name, 'status', p.status,
    -- tipo do projeto: é o que separa as frentes de um mesmo cliente
    'tipo', COALESCE(NULLIF(p.project_type, ''), 'Projetos'),
    'progress', p.progress, 'delivery_date', p.delivery_date, 'start_date', p.start_date
  ) ORDER BY p.created_at DESC), '[]'::jsonb) INTO projetos
    FROM public.projects p
    WHERE p.client_id = cid AND p.status IS DISTINCT FROM 'faturado';

  -- Horas por peça JÁ com o fator aplicado. O cliente recebe o número final;
  -- o multiplicador não vai no payload de propósito.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id, 'project_id', d.project_id, 'titulo', d.titulo,
    'data_entrega', d.data_entrega, 'status', d.status,
    'arquivo_url', d.arquivo_url, 'tipo', d.tipo,
    'aprovado_cliente_em', d.aprovado_cliente_em,
    'horas', ROUND(COALESCE(h.horas_total, 0) * _fator, 1)
  ) ORDER BY d.data_entrega NULLS LAST), '[]'::jsonb) INTO entregaveis
    FROM public.deliverables d
    JOIN public.projects p ON p.id = d.project_id
    LEFT JOIN public.v_horas_entregavel h ON h.deliverable_id = d.id
    WHERE p.client_id = cid AND d.visivel_cliente = true;

  -- Mês corrente, SÓ finalizado: é o que já pode ser cobrado.
  SELECT COALESCE(SUM(COALESCE(h.horas_total, 0) * _fator), 0)
    INTO _horas_mes
    FROM public.deliverables d
    JOIN public.projects p ON p.id = d.project_id
    LEFT JOIN public.v_horas_entregavel h ON h.deliverable_id = d.id
   WHERE p.client_id = cid
     AND d.visivel_cliente = true
     AND d.status IN ('entregue', 'aprovado')
     AND COALESCE(d.aprovado_cliente_em::date, d.data_entrega) >= _ini;

  _valor_mes := ROUND(_horas_mes * _valor_hora, 2);

  RETURN jsonb_build_object(
    'client', cliente,
    'projects', projetos,
    'deliverables', entregaveis,
    'resumo_mes', jsonb_build_object(
      'horas', ROUND(_horas_mes, 1),
      -- sem valor-hora configurado não inventa número: o portal esconde o bloco
      'valor', CASE WHEN _valor_hora > 0 THEN _valor_mes ELSE NULL END,
      'desde', _ini
    )
  );
END;
$$;
