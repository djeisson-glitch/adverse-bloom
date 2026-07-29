-- =========================================================================
-- Sem editor configurado, a fila devolvia ZERO — e o formulário prometia
-- "amanhã às 18:00" com o time cheio.
--
-- Medido em 28/07/2026: intake_editor_id NULO nos dois clientes com intake
-- ativo. Enquanto isso havia 28 entregáveis vencendo em 14 dias, 21 só no
-- Robert — cerca de 56h na conta do próprio cliente (2h/vídeo), uns 9 dias
-- úteis. O sistema oferecia o dia seguinte.
--
-- O defeito não é a configuração faltando: é FALHAR PRO LADO OTIMISTA. Um
-- campo em branco virava promessa confiante e errada, na frente do cliente.
--
-- Agora, sem editor, a conta usa a fila do TIME no horizonte dividida por
-- quem de fato tem trabalho. Não é tão bom quanto a fila da pessoa certa —
-- por isso o formulário passa a dizer que o prazo é estimado —, mas erra pro
-- lado seguro em vez de prometer o impossível.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.intake_fila_horas(_editor uuid, _edit_h numeric)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ate       date := (now() AT TIME ZONE 'America/Sao_Paulo')::date + 14;
  eh        numeric := GREATEST(coalesce(_edit_h, 4), 0);
  h         numeric := 0;
  n_data    int;
  n_cli     int;
  n_pessoas int;
  th        numeric;
BEGIN
  IF _editor IS NULL THEN
    SELECT count(*) INTO n_data
      FROM public.deliverables d
     WHERE coalesce(d.status, '') NOT IN ('aprovado','entregue','concluido','cancelado','arquivado','faturado')
       AND d.data_entrega IS NOT NULL
       AND d.data_entrega <= ate;

    SELECT GREATEST(count(DISTINCT d.responsavel_id), 1) INTO n_pessoas
      FROM public.deliverables d
     WHERE coalesce(d.status, '') NOT IN ('aprovado','entregue','concluido','cancelado','arquivado','faturado')
       AND d.data_entrega IS NOT NULL
       AND d.data_entrega <= ate
       AND d.responsavel_id IS NOT NULL;

    RETURN (coalesce(n_data, 0)::numeric / n_pessoas) * eh;
  END IF;

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
