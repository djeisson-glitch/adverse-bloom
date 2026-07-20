-- Fluxo do entregável com botões que disparam várias ações.
--
--  rev_ajuste_pendente: na 1ª volta (2 aprovações) o N1 pode "aprovar e seguir
--  pra Ap.2" OU "pedir ajuste e seguir pra Ap.2". Esta flag lembra que houve um
--  pedido de ajuste, pra que DEPOIS do N2 o entregável volte pro editor
--  (ajuste_interno) em vez de ir direto pra "pronto". Reset quando o editor
--  reenvia pra revisão.
ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS rev_ajuste_pendente boolean NOT NULL DEFAULT false;

-- O portal do cliente enxerga os status novos (em_pausa, ajuste_interno) como
-- "em edição" — a treta interna não vaza pro cliente.
CREATE OR REPLACE FUNCTION public.intake_config(_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c          record;
  andamento  jsonb;
  total      int;
BEGIN
  SELECT id, name, intake_ativo, intake_contatos INTO c
    FROM public.clients WHERE intake_slug = _slug LIMIT 1;
  IF NOT FOUND OR NOT c.intake_ativo THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO total
    FROM public.deliverables d
    JOIN public.projects p ON p.id = d.project_id
   WHERE p.client_id = c.id
     AND coalesce(d.status, '') NOT IN ('aprovado', 'entregue')
     AND coalesce(p.status, '') NOT IN ('faturado', 'cancelado', 'arquivado');

  SELECT COALESCE(jsonb_agg(to_jsonb(x) - 'ord' - 'prio' ORDER BY x.prio, x.ord), '[]'::jsonb)
    INTO andamento
  FROM (
    SELECT
      CASE WHEN coalesce(d.codigo, '') <> ''
           THEN '[' || d.codigo || '] ' || trim(regexp_replace(d.titulo, '^\s*(PÓS|POS|PROD|DESL)\s*\|\s*', '', 'i'))
           ELSE trim(regexp_replace(d.titulo, '^\s*(PÓS|POS|PROD|DESL)\s*\|\s*', '', 'i'))
      END AS nome,
      'entregavel'::text AS tipo,
      CASE d.status
        WHEN 'com_cliente'       THEN 'com_cliente'
        WHEN 'revisao_n1'        THEN 'revisao_interna'
        WHEN 'revisao_n2'        THEN 'revisao_interna'
        WHEN 'revisao'           THEN 'revisao_interna'
        WHEN 'pronto'            THEN 'revisao_interna'
        WHEN 'em_edicao'         THEN 'edicao'
        WHEN 'em_pausa'          THEN 'edicao'
        WHEN 'ajuste_interno'    THEN 'edicao'
        WHEN 'ajuste_solicitado' THEN 'edicao'
        ELSE 'na_fila'
      END AS etapa,
      d.data_entrega::text AS prazo,
      CASE d.status
        WHEN 'com_cliente' THEN 0
        WHEN 'revisao_n1' THEN 1 WHEN 'revisao_n2' THEN 1
        WHEN 'revisao' THEN 1 WHEN 'pronto' THEN 1
        WHEN 'em_edicao' THEN 2 WHEN 'em_pausa' THEN 2
        WHEN 'ajuste_interno' THEN 2 WHEN 'ajuste_solicitado' THEN 2
        ELSE 3
      END AS prio,
      coalesce(d.data_entrega, '9999-12-31'::date) AS ord
      FROM public.deliverables d
      JOIN public.projects p ON p.id = d.project_id
     WHERE p.client_id = c.id
       AND coalesce(d.status, '') NOT IN ('aprovado', 'entregue')
       AND coalesce(p.status, '') NOT IN ('faturado', 'cancelado', 'arquivado')
    UNION ALL
    SELECT dm.nome_projeto, 'demanda'::text, 'na_fila'::text, dm.prazo_desejado::text, 4,
           coalesce(dm.prazo_desejado, '9999-12-31'::date)
      FROM public.demandas dm
     WHERE dm.client_id = c.id AND dm.status = 'nova'
    ORDER BY 5, 6
    LIMIT 25
  ) x;

  RETURN jsonb_build_object(
    'nome', c.name, 'ativo', c.intake_ativo,
    'contatos', COALESCE(c.intake_contatos, '[]'::jsonb),
    'andamento', andamento, 'andamento_total', total
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.intake_config(text) TO anon, authenticated;
