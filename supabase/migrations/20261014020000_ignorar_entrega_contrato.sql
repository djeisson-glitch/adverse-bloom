BEGIN;
ALTER TABLE public.deliverables ADD COLUMN ignorar_contrato boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.deliverables.ignorar_contrato IS 'Exclusão reversível dos indicadores de consumo do contrato. Não exclui a peça, não altera tipo de mídia, status nem faturamento.';
CREATE OR REPLACE FUNCTION public.contrato_movimentos(_contrato uuid, _ate date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE c public.client_contratos; resultado jsonb; ini date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_ver_dinheiro() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO c FROM public.client_contratos WHERE id = _contrato;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  IF _ate IS NULL THEN RAISE EXCEPTION 'Informe o fim do período'; END IF;
  ini := coalesce(c.inicio, date_trunc('month', _ate)::date);
  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.data DESC, m.id), '[]'::jsonb) INTO resultado
  FROM (
    -- Mesma fonte de datas e classificação do fechamento mensal.
    SELECT d.id::text, 'entrega'::text AS tipo, d.titulo AS titulo,
      (dc.criacao_efetiva AT TIME ZONE 'America/Sao_Paulo')::date AS data,
      d.ignorar_contrato AS ignorar_contrato, to_jsonb(d)->>'tipo_midia' AS tipo_midia, to_jsonb(d)->>'tipo' AS tipo_registro,
      to_jsonb(d)->>'formato' AS formato, to_jsonb(d)->>'duracao' AS duracao,
      1::numeric AS quantidade, null::numeric AS quantidade_realizada, d.status::text AS status,
      df.faturamento_efetivo AS faturamento,
      jsonb_build_array(jsonb_build_object('id', p.id, 'nome', p.name)) AS projetos
    FROM public.deliverables d
    JOIN public.projects p ON p.id = d.project_id
    JOIN public.deliverables_criacao dc ON dc.id = d.id
    JOIN public.deliverables_faturamento df ON df.id = d.id
    WHERE p.client_id = c.client_id AND d.status NOT IN ('cancelado', 'reprovado')
      AND (dc.criacao_efetiva AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ini AND least(_ate, coalesce(c.fim, _ate))
    UNION ALL
    -- Uma captação compartilhada no mesmo dia consome a maior fração, não
    -- uma diária por projeto. Cobranças à parte ficam em outra linha.
    SELECT s.data::text || ':' || coalesce(p.faturamento, 'mensal'), 'diaria', 'Captação', s.data, false, null::text, null::text, null::text, null::text,
      max(s.fracao), coalesce(max(s.fracao) FILTER (WHERE s.status = 'realizada'), 0), CASE WHEN bool_and(s.status = 'realizada') THEN 'realizada' ELSE 'programada' END,
      coalesce(p.faturamento, 'mensal'),
      jsonb_agg(DISTINCT jsonb_build_object('id', p.id, 'nome', p.name))
    FROM public.producao_saidas s JOIN public.projects p ON p.id = s.project_id
    WHERE p.client_id = c.client_id AND s.tipo = 'diaria' AND s.status <> 'cancelada'
      AND s.data BETWEEN ini AND least(_ate, coalesce(c.fim, _ate))
    GROUP BY s.data, coalesce(p.faturamento, 'mensal')
  ) m;
  RETURN resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.contrato_movimentos(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contrato_movimentos(uuid,date) TO authenticated;



COMMIT;
