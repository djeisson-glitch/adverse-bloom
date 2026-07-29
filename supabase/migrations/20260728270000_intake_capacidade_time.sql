-- =========================================================================
-- O sistema media FILA e nunca CAPACIDADE.
--
-- Sem editor fixo no cliente ele olhava uma pessoa só (ou, na versão
-- anterior, rateava por "quem tem trabalho" — o que incluía admin e
-- atendimento, gente que não edita). Nunca perguntava quantos editores a
-- produtora tem.
--
-- Medido em 28/07/2026: Robert (papel edicao) com 21 peças vencendo em 14
-- dias; José (papel edicao) com 1. Dois editores, um deles praticamente
-- livre. A produtora TEM capacidade — o modelo é que não enxergava.
--
-- Agora, sem editor fixo:
--   espera = (fila de edição do time) / (nº de editores ativos)
-- A fila de edição conta o que está na mão de quem edita, mais o que está sem
-- dono — porque isso também vai cair em alguém.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.intake_editores_ativos()
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(COUNT(DISTINCT p.id), 1)::int
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
   WHERE coalesce(p.ativo, true)
     AND ur.role::text = 'edicao'
$$;

COMMENT ON FUNCTION public.intake_editores_ativos() IS
  'Quantos editores ativos a produtora tem. É o denominador da espera quando o cliente não tem editor fixo.';

GRANT EXECUTE ON FUNCTION public.intake_editores_ativos() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.intake_fila_horas(_editor uuid, _edit_h numeric)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ate       date := (now() AT TIME ZONE 'America/Sao_Paulo')::date + 14;
  eh        numeric := GREATEST(coalesce(_edit_h, 4), 0);
  h         numeric := 0;
  n_data    int;
  n_cli     int;
  n_edit    int;
  th        numeric;
BEGIN
  -- ---- Sem editor fixo: fila do time ÷ capacidade de edição --------------
  IF _editor IS NULL THEN
    n_edit := public.intake_editores_ativos();

    SELECT count(*) INTO n_data
      FROM public.deliverables d
     WHERE coalesce(d.status, '') NOT IN ('aprovado','entregue','concluido','cancelado','arquivado','faturado')
       AND d.data_entrega IS NOT NULL
       AND d.data_entrega <= ate
       -- quem edita, mais o que ainda não tem dono: vai cair em alguém
       AND (d.responsavel_id IS NULL OR EXISTS (
             SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = d.responsavel_id AND ur.role::text = 'edicao'));

    RETURN (coalesce(n_data, 0)::numeric * eh) / n_edit;
  END IF;

  -- ---- Com editor fixo: a fila dele, que é o mais preciso ---------------
  SELECT count(*) INTO n_data
    FROM public.deliverables d
   WHERE d.responsavel_id = _editor
     AND coalesce(d.status, '') NOT IN ('aprovado','entregue','concluido','cancelado','arquivado')
     AND d.data_entrega IS NOT NULL
     AND d.data_entrega <= ate;
  h := h + coalesce(n_data, 0) * eh;

  SELECT count(*) INTO n_cli
    FROM public.deliverables d
   WHERE d.responsavel_id = _editor
     AND d.data_entrega IS NULL
     AND coalesce(d.status, '') = 'com_cliente';
  h := h + coalesce(n_cli, 0) * eh * 0.6;

  SELECT coalesce(sum(estimativa_horas), 0) INTO th
    FROM public.tasks
   WHERE assigned_user_id = _editor
     AND completed = false
     AND due_date IS NOT NULL
     AND due_date::date <= ate;
  h := h + coalesce(th, 0);

  RETURN h;
END $$;

GRANT EXECUTE ON FUNCTION public.intake_fila_horas(uuid, numeric) TO anon, authenticated;
