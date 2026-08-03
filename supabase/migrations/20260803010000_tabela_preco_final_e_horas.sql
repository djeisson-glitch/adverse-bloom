-- =========================================================================
-- Tabela de preço que É o preço, e tipo sugerido pelas horas
--
-- O acordo do Sicredi Região (PDF de 29/07/2025) tem cinco linhas com preço
-- fechado e "taxas e impostos já inclusos", cada uma com um tempo estimado de
-- edição:
--
--   Pílula            R$   440    3,5h
--   Pílula +          R$   750    6h
--   Vídeo principal   R$ 1.250   10h
--   Edição urgente    R$   490    3h    (urgência e fila, não horas)
--   Captação          R$ 1.900    —     (equipe em campo)
--
-- Dois problemas achados conferindo isso contra o banco:
--
--  1. A tabela estava cadastrada com valores DESCONTADOS (276, 470, 783…),
--     esperando que margem 37,68% + imposto 11,5% reconstruíssem o preço do
--     acordo. Não reconstroem: dá R$ 423,70 onde o acordo diz R$ 440 — ~4%
--     PRA MENOS em todas as linhas. E qualquer mudança de margem no futuro
--     mexeria no preço combinado com o cliente sem ninguém perceber.
--     → `precos_finais`: quando o preço da tabela já é o preço, margem e
--       imposto não incidem. Um campo, não uma engenharia reversa.
--
--  2. NENHUMA das 17 entregas de julho casou com um tipo — todas ficaram
--     "SEM · R$ 0", e por isso o rascunho do mês está zerado. O casamento era
--     só por nome ("PÓS | Reel Sorteio Seguro de Vida" não contém "Pílula").
--     → agora são três tentativas, nesta ordem:
--         escolhido → o tipo confirmado na revisão do fechamento
--         nome      → o rótulo aparece no título/formato (jeito antigo)
--         horas     → o MENOR pacote que comporta o que a peça consumiu
--
-- A terceira é a que o Djêisson pediu: usar as horas (edição + revisão) como
-- base. Só entram na sugestão os tipos com horas de referência preenchida —
-- "Captação" e "Edição urgente" são decisão humana, não consequência do
-- relógio, e ficam de fora com horas_ref vazia.
--
-- O item do fechamento passa a carregar a ORIGEM do tipo, as horas realizadas
-- e a hora de referência: dá pra ver de onde veio o preço e quem estourou a
-- faixa sem abrir a peça.
--
-- Partido da definição VIGENTE (20260802190000), montado por script.
-- =========================================================================

ALTER TABLE public.client_precos
  ADD COLUMN IF NOT EXISTS horas_ref numeric(6,2);
COMMENT ON COLUMN public.client_precos.horas_ref IS
  'Horas de referência do tipo (edição + revisão). Vazio = não entra na sugestão automática por horas.';

ALTER TABLE public.client_faturamento
  ADD COLUMN IF NOT EXISTS precos_finais boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.client_faturamento.precos_finais IS
  'Tabela com impostos já inclusos: o preço combinado É o total. Margem e imposto não incidem.';

ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS tipo_cobranca text;
COMMENT ON COLUMN public.deliverables.tipo_cobranca IS
  'Tipo da tabela de preço confirmado na revisão do fechamento. Manda em cima de nome e horas.';

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
  _comissao numeric; _comissoes jsonb;
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
               'deliverable_id', x.id,
               'entregavel', x.titulo, 'formato', x.formato, 'duracao', x.duracao,
               'data', x.data_entrega,
               'tipo', x.tipo, 'preco', COALESCE(x.preco, 0),
               'origem', x.origem,          -- escolhido | nome | horas | nenhum
               'horas', x.horas,            -- realizado na peça (edição + alteração)
               'horas_ref', x.horas_ref     -- o que a tabela previa pra esse tipo
             ) ORDER BY x.data_entrega), '[]'::jsonb),
             COALESCE(SUM(COALESCE(x.preco, 0)), 0)
        INTO _itens, _subtotal
      FROM (
        SELECT d.id, d.titulo, d.formato, d.duracao, d.data_entrega,
               COALESCE(esc.tipo, nome.tipo, hr.tipo)     AS tipo,
               COALESCE(esc.preco, nome.preco, hr.preco)  AS preco,
               COALESCE(esc.horas_ref, nome.horas_ref, hr.horas_ref) AS horas_ref,
               CASE WHEN esc.tipo IS NOT NULL THEN 'escolhido'
                    WHEN nome.tipo IS NOT NULL THEN 'nome'
                    WHEN hr.tipo   IS NOT NULL THEN 'horas'
                    ELSE 'nenhum' END AS origem,
               h.horas
        FROM public.deliverables d
        JOIN public.projects p ON p.id = d.project_id

        -- horas REALIZADAS da peça: edição + alteração do cliente. É a base
        -- que o Djêisson pediu ("edição + buffer de revisão").
        LEFT JOIN LATERAL (
          SELECT ROUND(COALESCE(SUM(te.duration_min), 0) / 60.0, 2) AS horas
          FROM public.time_entries te WHERE te.deliverable_id = d.id AND te.billable
        ) h ON true

        -- 1º: o tipo ESCOLHIDO na revisão do fechamento manda em tudo.
        LEFT JOIN LATERAL (
          SELECT cp.tipo, cp.preco, cp.horas_ref FROM public.client_precos cp
          WHERE cp.client_id = c.client_id AND cp.ativo
            AND lower(cp.tipo) = lower(COALESCE(d.tipo_cobranca, ''))
          LIMIT 1
        ) esc ON true

        -- 2º: o nome/formato bate com o rótulo do tipo (jeito antigo).
        LEFT JOIN LATERAL (
          SELECT cp.tipo, cp.preco, cp.horas_ref FROM public.client_precos cp
          WHERE cp.client_id = c.client_id AND cp.ativo
            AND (lower(cp.tipo) = lower(COALESCE(d.formato, ''))
                 OR d.titulo ILIKE '%' || cp.tipo || '%'
                 OR COALESCE(d.formato, '') ILIKE '%' || cp.tipo || '%')
          ORDER BY cp.ordem LIMIT 1
        ) nome ON true

        -- 3º: pelas HORAS — o MENOR pacote que comporta o que a peça
        -- consumiu. Só entram tipos com horas de referência preenchida:
        -- "Captação" e "Edição urgente" são decisão humana, não consequência
        -- do relógio, e ficam de fora deixando horas_ref vazia.
        LEFT JOIN LATERAL (
          SELECT cp.tipo, cp.preco, cp.horas_ref FROM public.client_precos cp
          WHERE cp.client_id = c.client_id AND cp.ativo AND cp.horas_ref IS NOT NULL
            AND h.horas > 0
          ORDER BY (cp.horas_ref >= h.horas) DESC,   -- primeiro os que comportam
                   CASE WHEN cp.horas_ref >= h.horas THEN cp.horas_ref END ASC,
                   cp.horas_ref DESC                  -- não coube: o maior
          LIMIT 1
        ) hr ON true

        WHERE p.client_id = c.client_id AND p.faturamento = 'mensal'
          AND d.data_entrega >= _ini AND d.data_entrega < _fim
          AND d.status NOT IN ('reprovado', 'cancelado')
      ) x;

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

    -- Tabela com "taxas e impostos já inclusos" (o caso do Sicredi Região):
    -- o preço combinado JÁ é o que o cliente paga. Somar margem e imposto por
    -- cima cobraria a mais; descontar por baixo pra reconstruir o preço, que
    -- era o que estava sendo feito, erra sempre que a margem muda — e estava
    -- errando ~4% pra menos em todas as linhas.
    _margem  := CASE WHEN c.precos_finais THEN 0
                     ELSE ROUND(_subtotal * COALESCE(c.margem_percent, 0) / 100, 2) END;

    -- Comissão sobre o SUBTOTAL 2 (subtotal + margem), como na planilha de
    -- orçamento. Cada linha é % ou valor fixo; o mesmo formato dos orçamentos
    -- ({nome, tipo, valor}) pra não existirem duas gramáticas de comissão.
    _comissoes := COALESCE(c.comissoes, '[]'::jsonb);
    SELECT COALESCE(SUM(
             CASE WHEN x->>'tipo' = '%'
                  THEN (_subtotal + _margem) * COALESCE((x->>'valor')::numeric, 0) / 100
                  ELSE COALESCE((x->>'valor')::numeric, 0)
             END), 0)
      INTO _comissao
      FROM jsonb_array_elements(_comissoes) x;
    _comissao := ROUND(COALESCE(_comissao, 0), 2);

    -- Imposto incide depois da comissão: ela entra na nota.
    _imposto := CASE WHEN c.precos_finais THEN 0
                     ELSE ROUND((_subtotal + _margem + _comissao) * COALESCE(c.imposto_percent, 0) / 100, 2) END;
    _total   := _subtotal + _margem + _comissao + _imposto;

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
      'avulsos', _avulsos,
      'comissoes', _comissoes,
      'subtotal2', _subtotal + _margem
    );

    INSERT INTO public.faturamento_mensal AS fm (
      client_id, ref_mes, modelo, horas_edicao, horas_alteracao, valor_hora,
      subtotal, margem_percent, margem_valor, comissao_valor, imposto_percent, imposto_valor, total,
      detalhe, status, gerado_auto, gerado_em
    ) VALUES (
      c.client_id, _ini, c.modelo, _h_edic, _h_alt, _valor_hora,
      _subtotal,
      CASE WHEN c.precos_finais THEN 0 ELSE COALESCE(c.margem_percent, 0) END, _margem, _comissao,
      CASE WHEN c.precos_finais THEN 0 ELSE COALESCE(c.imposto_percent, 0) END, _imposto, _total,
      _detalhe, 'rascunho', (auth.uid() IS NULL), now()
    )
    ON CONFLICT (client_id, ref_mes) DO UPDATE SET
      modelo = EXCLUDED.modelo, horas_edicao = EXCLUDED.horas_edicao,
      horas_alteracao = EXCLUDED.horas_alteracao, valor_hora = EXCLUDED.valor_hora,
      subtotal = EXCLUDED.subtotal, margem_percent = EXCLUDED.margem_percent,
      margem_valor = EXCLUDED.margem_valor, comissao_valor = EXCLUDED.comissao_valor,
      imposto_percent = EXCLUDED.imposto_percent,
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
