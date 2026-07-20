-- =========================================================================
-- Intake: o bloco "já em andamento" passa a listar ENTREGÁVEIS, não projetos.
--
--  Por quê: o cliente não pensa em "projeto", pensa na peça. E o nome interno
--  do projeto (#20261707_VIDEO_IA_COBRANCA_DE_INADIMPLENCIA_SICREDI...) é
--  ilegível pra quem está do outro lado.
--
--  Três decisões de exposição, porque a página é PÚBLICA (SECURITY DEFINER
--  + GRANT anon, sem login):
--   • nome vai como "[ADVR-0000] Nome da peça" — com o prefixo interno
--     ("PÓS | ") removido;
--   • a data mostrada é SEMPRE a do cliente (data_entrega). O prazo_interno
--     é o nosso colchão e viraria promessa se vazasse pra cá;
--   • etapa vai como chave curta (na_fila / edicao / revisao_interna /
--     com_cliente) e quem escreve o rótulo é a tela. Nada de status cru,
--     nome de editor, valor ou id de projeto.
--
--  A ordem é por quem precisa de ação: o que está com o cliente vem primeiro.
-- =========================================================================

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
      -- "[ADVR-0000] Nome da peça" — sem o prefixo interno do ClickUp.
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
        WHEN 'ajuste_solicitado' THEN 'edicao'
        ELSE 'na_fila'
      END AS etapa,
      d.data_entrega::text AS prazo,   -- data do CLIENTE, nunca a interna
      CASE d.status
        WHEN 'com_cliente' THEN 0
        WHEN 'revisao_n1' THEN 1 WHEN 'revisao_n2' THEN 1
        WHEN 'revisao' THEN 1 WHEN 'pronto' THEN 1
        WHEN 'em_edicao' THEN 2 WHEN 'ajuste_solicitado' THEN 2
        ELSE 3
      END AS prio,
      -- Sem data vai pro fim do próprio grupo.
      coalesce(d.data_entrega, '9999-12-31'::date) AS ord
      FROM public.deliverables d
      JOIN public.projects p ON p.id = d.project_id
     WHERE p.client_id = c.id
       AND coalesce(d.status, '') NOT IN ('aprovado', 'entregue')
       AND coalesce(p.status, '') NOT IN ('faturado', 'cancelado', 'arquivado')

    UNION ALL

    -- Demanda aberta que ainda não virou entregável continua aparecendo:
    -- pra pessoa não pedir a mesma coisa duas vezes.
    SELECT dm.nome_projeto,
           'demanda'::text,
           'na_fila'::text,
           dm.prazo_desejado::text,
           4,
           coalesce(dm.prazo_desejado, '9999-12-31'::date)
      FROM public.demandas dm
     WHERE dm.client_id = c.id
       AND dm.status = 'nova'

    ORDER BY 5, 6
    LIMIT 12
  ) x;

  RETURN jsonb_build_object(
    'nome', c.name,
    'ativo', c.intake_ativo,
    'contatos', COALESCE(c.intake_contatos, '[]'::jsonb),
    'andamento', andamento,
    'andamento_total', total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.intake_config(text) TO anon, authenticated;
