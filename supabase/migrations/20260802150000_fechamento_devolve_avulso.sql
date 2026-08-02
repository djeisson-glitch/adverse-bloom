-- =========================================================================
-- Devolve o projeto AVULSO pra fora do fechamento mensal
--
-- Regressão minha, de 29/07: a migration que filtrava demanda recusada
-- (20260729200000) reescreveu gerar_faturamento_mensal a partir de uma cópia
-- ANTERIOR à 20260719190000 — a que criou o `projects.faturamento`. Com isso
-- os OITO filtros `p.faturamento = 'mensal'` e o bloco inteiro dos avulsos
-- sumiram sem erro nenhum: CREATE OR REPLACE aceita qualquer corpo.
--
-- O efeito apareceu no fechamento de julho do Sul Minas, véspera de faturar:
-- o #20260113_MANIFESTO_SULMINAS (avulso, 22h57) entrou na conta mensal e o
-- rascunho foi de R$ 6.465,18 pra R$ 12.222,87 — R$ 5.757 de trabalho que o
-- Djêisson fatura à parte, prestes a ser cobrado duas vezes.
--
-- Este arquivo é a versão de 20260719190000 (íntegra, com os avulsos) MAIS o
-- filtro de demanda recusada. Nada além disso.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.gerar_faturamento_mensal(_ref_mes date, _client uuid DEFAULT NULL, _apenas_auto boolean DEFAULT false)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _ini date := date_trunc('month', _ref_mes)::date;
  _fim date := (date_trunc('month', _ref_mes) + interval '1 month')::date;
  _n int := 0;
  c record;
  _ctr record;
  _min_edic numeric; _min_alt numeric;
  _h_edic numeric; _h_alt numeric; _h_tot numeric;
  _valor_hora numeric; _subtotal numeric; _margem numeric; _imposto numeric; _total numeric;
  _ref_rate numeric;
  _demandas jsonb; _alteracoes jsonb; _n_alt int; _por_projeto jsonb;
  _itens jsonb; _consumo jsonb; _saude jsonb; _detalhe jsonb;
  _avulsos jsonb;
  _diarias_usadas int; _entregas_usadas int;
  _jan_ini date; _diarias_jan int; _entregas_jan int;
BEGIN
  -- guarda: usuário logado precisa ver dinheiro; o cron (auth.uid() null) passa
  IF auth.uid() IS NOT NULL AND NOT public.pode_ver_dinheiro(auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão para gerar faturamento';
  END IF;

  -- nosso valor-hora de tabela (referência p/ comparação de saúde) = Edição do rate_card
  _ref_rate := COALESCE((SELECT preco_hora FROM public.rate_card
                          WHERE ativo AND funcao ILIKE 'edi%' ORDER BY ordem LIMIT 1), 0);

  FOR c IN
    SELECT cf.*, cl.name AS client_name
    FROM public.client_faturamento cf
    JOIN public.clients cl ON cl.id = cf.client_id
    WHERE cf.modelo <> 'nenhum'
      AND (_client IS NULL OR cf.client_id = _client)
      AND (_apenas_auto = false OR cf.auto_mensal)
  LOOP
    -- horas do mês (edição pura × alteração pedida pelo cliente)
    SELECT COALESCE(SUM(te.duration_min) FILTER (WHERE te.alteracao_id IS NULL), 0),
           COALESCE(SUM(te.duration_min) FILTER (WHERE te.alteracao_id IS NOT NULL), 0)
      INTO _min_edic, _min_alt
    FROM public.time_entries te
    JOIN public.projects p ON p.id = te.project_id
    WHERE p.client_id = c.client_id AND te.billable AND p.faturamento = 'mensal'
      AND te.start_at >= _ini AND te.start_at < _fim;
    _h_edic := ROUND(_min_edic / 60.0, 2);
    _h_alt  := ROUND(_min_alt / 60.0, 2);
    _h_tot  := _h_edic + _h_alt;

    -- relatório: demandas do mês (quem pediu)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'solicitante', d.solicitante_nome, 'email', d.solicitante_email,
             'projeto', d.nome_projeto, 'status', d.status, 'data', d.created_at,
             'n_entregas', COALESCE(jsonb_array_length(d.entregas), 0)
           ) ORDER BY d.created_at), '[]'::jsonb)
      INTO _demandas
    FROM public.demandas d
    WHERE d.client_id = c.client_id AND d.created_at >= _ini AND d.created_at < _fim
      -- Demanda RECUSADA não entra no relatório do cliente: ela não virou
      -- trabalho, e listá-la no fechamento é mostrar pro cliente um pedido que
      -- a gente negou — junto de uma fatura.
      AND coalesce(d.status, '') NOT IN ('recusada', 'cancelada');

    -- relatório: alterações do mês (quem pediu, em qual entregável)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'titulo', da.titulo, 'quem', da.criado_por, 'data', da.created_at,
             'entregavel', d.titulo, 'projeto', p.name
           ) ORDER BY da.created_at), '[]'::jsonb), COUNT(*)
      INTO _alteracoes, _n_alt
    FROM public.deliverable_alteracoes da
    JOIN public.deliverables d ON d.id = da.deliverable_id
    JOIN public.projects p ON p.id = d.project_id
    WHERE p.client_id = c.client_id AND p.faturamento = 'mensal' AND da.created_at >= _ini AND da.created_at < _fim;

    -- relatório: horas por projeto
    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'horas')::numeric DESC), '[]'::jsonb) INTO _por_projeto
    FROM (
      SELECT jsonb_build_object(
               'projeto', p.name,
               'horas_edicao', ROUND(COALESCE(SUM(te.duration_min) FILTER (WHERE te.alteracao_id IS NULL),0)/60.0,2),
               'horas_alteracao', ROUND(COALESCE(SUM(te.duration_min) FILTER (WHERE te.alteracao_id IS NOT NULL),0)/60.0,2),
               'horas', ROUND(SUM(te.duration_min)/60.0,2)) AS x
      FROM public.time_entries te
      JOIN public.projects p ON p.id = te.project_id
      WHERE p.client_id = c.client_id AND te.billable AND p.faturamento = 'mensal' AND te.start_at >= _ini AND te.start_at < _fim
      GROUP BY p.name
    ) q;

    -- Projetos AVULSOS do mês: ficam FORA de tudo que foi somado acima, mas
    -- entram no detalhe pra ninguém esquecer de faturar à parte. Um avulso que
    -- some da tela é dinheiro que não é cobrado.
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'projeto'), '[]'::jsonb) INTO _avulsos
    FROM (
      SELECT jsonb_build_object(
               'projeto', p.name,
               'numero', p.numero,
               'horas', ROUND(COALESCE(SUM(te.duration_min), 0) / 60.0, 2),
               'entregas', (SELECT COUNT(*) FROM public.deliverables d
                             WHERE d.project_id = p.id
                               AND d.data_entrega >= _ini AND d.data_entrega < _fim
                               AND d.status NOT IN ('reprovado', 'cancelado'))
             ) AS x
      FROM public.projects p
      LEFT JOIN public.time_entries te
        ON te.project_id = p.id AND te.billable
       AND te.start_at >= _ini AND te.start_at < _fim
      WHERE p.client_id = c.client_id AND p.faturamento = 'avulso'
        AND (
          EXISTS (SELECT 1 FROM public.time_entries t2
                   WHERE t2.project_id = p.id AND t2.billable
                     AND t2.start_at >= _ini AND t2.start_at < _fim)
          OR EXISTS (SELECT 1 FROM public.deliverables d2
                      WHERE d2.project_id = p.id
                        AND d2.data_entrega >= _ini AND d2.data_entrega < _fim
                        AND d2.status NOT IN ('reprovado', 'cancelado'))
        )
      GROUP BY p.id, p.name, p.numero
    ) q;

    -- subtotal por modelo
    _itens := '[]'::jsonb;
    _consumo := NULL;
    _valor_hora := c.valor_hora;

    IF c.modelo = 'horas' THEN
      _subtotal := ROUND(_h_tot * c.valor_hora, 2);

    ELSIF c.modelo = 'tabela' THEN
      _valor_hora := 0;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'entregavel', d.titulo, 'formato', d.formato, 'duracao', d.duracao,
               'data', d.data_entrega, 'tipo', m.tipo, 'preco', COALESCE(m.preco, 0)
             ) ORDER BY d.data_entrega), '[]'::jsonb),
             COALESCE(SUM(COALESCE(m.preco, 0)), 0)
        INTO _itens, _subtotal
      FROM public.deliverables d
      JOIN public.projects p ON p.id = d.project_id
      LEFT JOIN LATERAL (
        SELECT cp.tipo, cp.preco FROM public.client_precos cp
        WHERE cp.client_id = c.client_id AND cp.ativo
          AND (lower(cp.tipo) = lower(COALESCE(d.formato, ''))
               OR d.titulo ILIKE '%' || cp.tipo || '%'
               OR COALESCE(d.formato, '') ILIKE '%' || cp.tipo || '%')
        ORDER BY cp.ordem LIMIT 1
      ) m ON true
      WHERE p.client_id = c.client_id AND p.faturamento = 'mensal'
        AND d.data_entrega >= _ini AND d.data_entrega < _fim
        AND d.status NOT IN ('reprovado', 'cancelado');

    ELSIF c.modelo = 'contrato' THEN
      _valor_hora := 0;
      SELECT * INTO _ctr FROM public.client_contratos
        WHERE client_id = c.client_id AND ativo ORDER BY created_at DESC LIMIT 1;
      _subtotal := COALESCE(_ctr.valor_mensal, 0);

      SELECT COUNT(*) INTO _diarias_usadas
      FROM public.producao_saidas s JOIN public.projects p ON p.id = s.project_id
      WHERE p.client_id = c.client_id AND p.faturamento = 'mensal' AND s.tipo = 'diaria' AND s.status <> 'cancelada'
        AND s.data >= _ini AND s.data < _fim;
      SELECT COUNT(*) INTO _entregas_usadas
      FROM public.deliverables d JOIN public.projects p ON p.id = d.project_id
      WHERE p.client_id = c.client_id AND p.faturamento = 'mensal' AND d.data_entrega >= _ini AND d.data_entrega < _fim
        AND d.status NOT IN ('reprovado', 'cancelado');

      _jan_ini := (_ini - ((COALESCE(_ctr.acumulo_meses, 1) - 1) || ' months')::interval)::date;
      SELECT COUNT(*) INTO _diarias_jan
      FROM public.producao_saidas s JOIN public.projects p ON p.id = s.project_id
      WHERE p.client_id = c.client_id AND p.faturamento = 'mensal' AND s.tipo = 'diaria' AND s.status <> 'cancelada'
        AND s.data >= _jan_ini AND s.data < _fim;
      SELECT COUNT(*) INTO _entregas_jan
      FROM public.deliverables d JOIN public.projects p ON p.id = d.project_id
      WHERE p.client_id = c.client_id AND p.faturamento = 'mensal' AND d.data_entrega >= _jan_ini AND d.data_entrega < _fim
        AND d.status NOT IN ('reprovado', 'cancelado');

      _consumo := jsonb_build_object(
        'contrato', COALESCE(_ctr.nome, 'Contrato'),
        'valor_mensal', COALESCE(_ctr.valor_mensal, 0),
        'diarias_franquia_mes', COALESCE(_ctr.diarias_mes, 0),
        'entregas_franquia_mes', COALESCE(_ctr.entregas_mes, 0),
        'acumulo_meses', COALESCE(_ctr.acumulo_meses, 1),
        'diarias_usadas_mes', _diarias_usadas,
        'entregas_usadas_mes', _entregas_usadas,
        'diarias_saldo_janela', COALESCE(_ctr.diarias_mes, 0) * COALESCE(_ctr.acumulo_meses, 1) - _diarias_jan,
        'entregas_saldo_janela', COALESCE(_ctr.entregas_mes, 0) * COALESCE(_ctr.acumulo_meses, 1) - _entregas_jan
      );
    END IF;

    _subtotal := COALESCE(_subtotal, 0);
    _margem  := ROUND(_subtotal * COALESCE(c.margem_percent, 0) / 100, 2);
    _imposto := ROUND((_subtotal + _margem) * COALESCE(c.imposto_percent, 0) / 100, 2);
    _total   := _subtotal + _margem + _imposto;

    -- saúde: contrato/tabela × quanto renderia por horas ao nosso valor de tabela
    _saude := jsonb_build_object(
      'valor_hora_referencia', _ref_rate,
      'horas_total', _h_tot,
      'valor_equivalente_horas', ROUND(_h_tot * _ref_rate, 2),
      'valor_cobrado', _total,
      'diferenca', ROUND(_total - _h_tot * _ref_rate, 2)
    );

    _detalhe := jsonb_build_object(
      'modelo', c.modelo,
      'periodo', jsonb_build_object('inicio', _ini, 'fim', _fim),
      'horas_edicao', _h_edic, 'horas_alteracao', _h_alt, 'horas_total', _h_tot,
      'por_projeto', _por_projeto,
      'itens', _itens,
      'consumo', _consumo,
      'saude', _saude,
      'demandas', _demandas,
      'alteracoes', _alteracoes,
      'n_alteracoes', COALESCE(_n_alt, 0),
      'avulsos', _avulsos
    );

    INSERT INTO public.faturamento_mensal AS fm (
      client_id, ref_mes, modelo, horas_edicao, horas_alteracao, valor_hora,
      subtotal, margem_percent, margem_valor, imposto_percent, imposto_valor, total,
      detalhe, status, gerado_auto, gerado_em
    ) VALUES (
      c.client_id, _ini, c.modelo, _h_edic, _h_alt, _valor_hora,
      _subtotal, COALESCE(c.margem_percent, 0), _margem, COALESCE(c.imposto_percent, 0), _imposto, _total,
      _detalhe, 'rascunho', (auth.uid() IS NULL), now()
    )
    ON CONFLICT (client_id, ref_mes) DO UPDATE SET
      modelo = EXCLUDED.modelo, horas_edicao = EXCLUDED.horas_edicao,
      horas_alteracao = EXCLUDED.horas_alteracao, valor_hora = EXCLUDED.valor_hora,
      subtotal = EXCLUDED.subtotal, margem_percent = EXCLUDED.margem_percent,
      margem_valor = EXCLUDED.margem_valor, imposto_percent = EXCLUDED.imposto_percent,
      imposto_valor = EXCLUDED.imposto_valor, total = EXCLUDED.total,
      detalhe = EXCLUDED.detalhe, gerado_em = now()
    -- não sobrescreve o que já foi enviado/faturado
    WHERE fm.status IN ('rascunho', 'revisado');

    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.gerar_faturamento_mensal(date, uuid, boolean) TO authenticated;
