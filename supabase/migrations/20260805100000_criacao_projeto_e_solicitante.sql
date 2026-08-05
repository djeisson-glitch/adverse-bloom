-- =========================================================================
-- Quando o projeto nasceu, e quem pediu cada peça
--
-- DATA DE CRIAÇÃO. `created_at` responde "quando esta linha entrou no banco",
-- que NÃO é a mesma pergunta que "quando o projeto começou". Nos 185 projetos
-- vindos do ClickUp as duas respostas divergem por meses: created_at é
-- 16/07/2026, o dia da importação — o mesmo problema que fazia o relatório do
-- cliente dizer que tudo foi solicitado no mesmo dia.
--
-- `criado_em` é a data que VALE, editável por quem administra; `created_at`
-- continua intocado como carimbo do sistema. Duas colunas porque são dois
-- fatos: se eu deixasse editar o created_at, perderíamos pra sempre a
-- informação de quando o registro entrou — e é ela que explica divergências
-- de importação seis meses depois.
--
-- QUEM SOLICITOU. Hoje só existe em `demandas.solicitante_nome`, e só 2 das
-- 16 peças do Sul Minas vieram do formulário. O resto é conversa de WhatsApp
-- que alguém cadastrou na mão — e "quem pediu isso?" é a primeira pergunta
-- quando uma entrega é questionada.
-- =========================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS criado_em timestamptz;

COMMENT ON COLUMN public.projects.criado_em IS
  'Quando o projeto começou de fato (editável — permite corrigir o retroativo '
  'do ClickUp). Vazio = usar created_at. created_at NUNCA é editado: é o '
  'carimbo de entrada no sistema.';

ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS solicitado_por text;

COMMENT ON COLUMN public.deliverables.solicitado_por IS
  'Quem pediu a peça. Preenchido pela demanda quando veio do formulário; '
  'digitado à mão quando o pedido chegou por WhatsApp/e-mail.';

-- Peça que veio de demanda já sabe quem pediu — não faz sentido alguém
-- redigitar o que o formulário registrou.
UPDATE public.deliverables d
   SET solicitado_por = dem.solicitante_nome
  FROM public.demandas dem
 WHERE dem.projeto_id = d.project_id
   AND d.solicitado_por IS NULL
   AND nullif(btrim(dem.solicitante_nome), '') IS NOT NULL;

/**
 * Mantém o solicitante em dia quando a peça nasce de um projeto que veio de
 * demanda. Sem isto, só as peças que já existiam no momento do UPDATE acima
 * teriam o nome — as criadas depois voltariam a nascer vazias.
 */
CREATE OR REPLACE FUNCTION public.tg_deliverable_solicitante()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.solicitado_por IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT nullif(btrim(dem.solicitante_nome), '')
      INTO NEW.solicitado_por
      FROM public.demandas dem
     WHERE dem.projeto_id = NEW.project_id
     ORDER BY dem.created_at
     LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deliverable_solicitante ON public.deliverables;
CREATE TRIGGER trg_deliverable_solicitante
  BEFORE INSERT ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_deliverable_solicitante();

DO $$
DECLARE com_nome int; total int;
BEGIN
  SELECT count(*) FILTER (WHERE solicitado_por IS NOT NULL), count(*)
    INTO com_nome, total FROM public.deliverables;
  RAISE NOTICE 'entregáveis com solicitante: % de %', com_nome, total;
END $$;
