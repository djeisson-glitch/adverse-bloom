-- slack_item: o nome do projeto não repete o número (o `name` já vem como
-- "[0355] Olimpíadas…") e o status do projeto sai legível no cartão do /advr.

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
    'projeto', CASE WHEN p.name LIKE '[%' THEN p.name
                    ELSE nullif(concat_ws(' ', nullif('[' || p.numero || ']',''), p.name), '') END,
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
    'codigo', p.numero, 'titulo', p.name,
    'status', CASE p.status
      WHEN 'novo' THEN 'Novo'                WHEN 'aguardando' THEN 'Aguardando'
      WHEN 'producao' THEN 'Produção'        WHEN 'pos-producao' THEN 'Pós-produção'
      WHEN 'fechamento' THEN 'Fechamento'    WHEN 'entregue' THEN 'Entregue'
      WHEN 'finalizado' THEN 'Finalizado'    ELSE p.status END,
    'projeto', p.client_name, 'responsavel', NULL,
    'prazo', to_char(p.delivery_date, 'DD/MM'),
    'link', '/projetos/' || p.id
  ) INTO achado
  FROM public.projects p WHERE p.numero = lpad(digitos, 4, '0') LIMIT 1;
  RETURN achado;
END $$;
