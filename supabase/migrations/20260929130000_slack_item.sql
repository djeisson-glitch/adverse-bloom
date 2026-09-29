-- Resolvedor do /advr (arquivo próprio: a migration anterior já tinha sido
-- aplicada quando esta função foi escrita).

-- Resolvedor do /advr: pelo código do entregável (ADVR-4448) ou pelo número do
-- projeto (0355). Só escopo — nada de valor, custo ou margem, porque o comando
-- responde no canal e todo mundo vê.
CREATE OR REPLACE FUNCTION public.slack_item(_texto text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE digitos text; achado jsonb;
BEGIN
  digitos := nullif(regexp_replace(coalesce(_texto,''), '\D', '', 'g'), '');
  IF digitos IS NULL OR length(digitos) > 8 THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'codigo', d.codigo,
    'titulo', d.titulo,
    'status', CASE d.status
      WHEN 'em_edicao' THEN 'Em edição'        WHEN 'ajuste_interno' THEN 'Ajuste interno'
      WHEN 'ajuste_solicitado' THEN 'Ajuste do cliente' WHEN 'aprovado' THEN 'Aprovado'
      WHEN 'com_cliente' THEN 'Com o cliente'  WHEN 'entregue' THEN 'Entregue'
      WHEN 'em_pausa' THEN 'Em pausa'          WHEN 'pendente' THEN 'Pendente'
      WHEN 'pronto_editar' THEN 'Pronto pra editar'
      WHEN 'revisao_n1' THEN 'Revisão 1'       WHEN 'revisao_n2' THEN 'Revisão 2'
      ELSE d.status END,
    'projeto', nullif(concat_ws(' ', nullif('[' || p.numero || ']',''), p.name), ''),
    'responsavel', pr.full_name,
    'prazo', to_char(coalesce(d.prazo_interno, d.data_entrega), 'DD/MM'),
    'link', '/projetos/' || d.project_id || '/entregaveis/' || d.id
  ) INTO achado
  FROM public.deliverables d
  LEFT JOIN public.projects p ON p.id = d.project_id
  LEFT JOIN public.profiles pr ON pr.id = d.responsavel_id
  WHERE regexp_replace(d.codigo, '\D', '', 'g') = digitos
  LIMIT 1;
  IF achado IS NOT NULL THEN RETURN achado; END IF;

  SELECT jsonb_build_object(
    'codigo', p.numero, 'titulo', p.name, 'status', p.status,
    'projeto', p.client_name, 'responsavel', NULL,
    'prazo', to_char(p.delivery_date, 'DD/MM'),
    'link', '/projetos/' || p.id
  ) INTO achado
  FROM public.projects p WHERE p.numero = lpad(digitos, 4, '0') LIMIT 1;
  RETURN achado;
END $$;
REVOKE ALL ON FUNCTION public.slack_item(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.slack_item(text) TO service_role;
