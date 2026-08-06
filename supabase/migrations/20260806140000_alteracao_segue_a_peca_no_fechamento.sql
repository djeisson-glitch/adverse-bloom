-- =========================================================================
-- Alteração segue a PEÇA no fechamento também
--
-- A carta do cliente foi corrigida ontem pra contar alteração pelo mês da
-- peça. O rascunho do fechamento não foi — ele calcula o mesmo dado por
-- outro caminho, e ficou no critério antigo (`da.created_at` no mês).
--
-- Resultado, julho/2026 Sul Minas, lado a lado nas duas telas:
--
--   carta do cliente     4 alterações   4299 · 4306 · 4007 · 4348
--   rascunho do fech.    3 alterações   4348 · 4299 · 4298(peça de JUNHO)
--
-- Dois documentos do mesmo mês, do mesmo cliente, discordando. Corrigi um
-- lado e não fui atrás do outro — é a mesma auditoria pela metade.
--
-- Agora vale a régua única em todo lugar: alteração pertence ao mês da PEÇA,
-- como as horas dela. Alteração pedida em agosto num job de julho é de
-- julho; pedida em julho num job de junho é de junho.
--
-- As DEMANDAS seguem pela própria data: uma demanda é o pedido entrando, e a
-- data dela É a data de criação — não há peça anterior a que se referir.
--
-- Partiu da definição vigente do 20260805230000; muda só o bloco de
-- alterações.
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
  _comissao numeric; _comissoes jsonb;
  _diarias_det jsonb; _diarias_repasse numeric; _saldo_usado jsonb;
  _valor_diaria numeric; _diarias_qtd numeric; _diarias_cobradas numeric;
  _saldo_diarias numeric; _diarias_valor numeric;
  _ref_rate numeric;
  _demandas jsonb; _alteracoes jsonb; _n_alt int; _por_projeto jsonb;
  _itens jsonb; _consumo jsonb; _saude jsonb; _detalhe jsonb;
  _avulsos jsonb;
  _diarias_usadas numeric; _entregas_usadas int;
  _jan_ini date; _diarias_jan numeric; _entregas_jan int;
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
    -- A competência da hora é a criação da PEÇA em que ela foi lançada; hora
    -- solta no projeto cai na criação do projeto.
    LEFT JOIN public.deliverables_criacao dc ON dc.id = te.deliverable_id
    WHERE p.client_id = c.client_id AND te.billable AND p.faturamento = 'mensal'
      AND COALESCE(dc.criacao_efetiva, p.criado_em, p.created_at) >= _ini
      AND COALESCE(dc.criacao_efetiva, p.criado_em, p.created_at) <  _fim;
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
    -- O mês vem da PEÇA, não da data em que a alteração foi pedida: é a
    -- mesma régua das horas, e é o que faz esta lista bater com a carta.
    JOIN public.deliverables_criacao dc ON dc.id = d.id
    WHERE p.client_id = c.client_id AND p.faturamento = 'mensal'
      AND dc.criacao_efetiva >= _ini AND dc.criacao_efetiva < _fim;

    -- relatório: horas por projeto
    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'horas')::numeric DESC), '[]'::jsonb) INTO _por_projeto
    FROM (
      SELECT jsonb_build_object(
               'projeto', p.name,
               'numero', p.numero,
               -- Data de criação do projeto: mesma regra do resto do sistema
               -- (`criado_em` ajustado à mão vence o `created_at`, que pra 185
               -- projetos é a data da importação do ClickUp, não a real).
               -- Mesma data que a tela de Entregas do mês usa pra cortar o
               -- mês: a mais antiga das peças do projeto (onde a data do
               -- projeto já prevalece sobre a da peça). Sem peça, cai no
               -- projeto — é o único caso em que a view não tem resposta.
               'criacao', COALESCE(
                 (SELECT MIN(dc.criacao_efetiva)
                    FROM public.deliverables_criacao dc
                    JOIN public.deliverables d2 ON d2.id = dc.id
                   WHERE d2.project_id = p.id),
                 p.criado_em, p.created_at),
               'horas_edicao', ROUND(COALESCE(SUM(te.duration_min) FILTER (WHERE te.alteracao_id IS NULL),0)/60.0,2),
               'horas_alteracao', ROUND(COALESCE(SUM(te.duration_min) FILTER (WHERE te.alteracao_id IS NOT NULL),0)/60.0,2),
               'horas', ROUND(SUM(te.duration_min)/60.0,2)) AS x
      FROM public.time_entries te
      JOIN public.projects p ON p.id = te.project_id
      LEFT JOIN public.deliverables_criacao dc ON dc.id = te.deliverable_id
      WHERE p.client_id = c.client_id AND te.billable AND p.faturamento = 'mensal'
        AND COALESCE(dc.criacao_efetiva, p.criado_em, p.created_at) >= _ini
        AND COALESCE(dc.criacao_efetiva, p.criado_em, p.created_at) <  _fim
      -- Agrupa por p.id e não por p.name: dois projetos de nome igual viravam
      -- UMA linha com a soma dos dois, e agora cada um tem data própria pra
      -- mostrar. p.id é PK, então o resto do GROUP BY é só sintaxe.
      GROUP BY p.id, p.name, p.numero, p.criado_em, p.created_at
    ) q;

    -- Projetos AVULSOS do mês: ficam FORA de tudo que foi somado acima, mas
    -- entram no detalhe pra ninguém esquecer de faturar à parte. Um avulso que
    -- some da tela é dinheiro que não é cobrado.
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'projeto'), '[]'::jsonb) INTO _avulsos
    FROM (
      SELECT jsonb_build_object(
               'projeto', p.name,
               'numero', p.numero,
               -- Subconsulta e não SUM sobre LEFT JOIN: o filtro de competência
               -- precisa valer só pra SOMA das horas. Posto no WHERE, ele
               -- derrubaria o projeto que tem entrega no mês e nenhuma hora —
               -- justo o avulso que mais se esquece de cobrar.
               'horas', (SELECT ROUND(COALESCE(SUM(t.duration_min), 0) / 60.0, 2)
                           FROM public.time_entries t
                           LEFT JOIN public.deliverables_criacao dct ON dct.id = t.deliverable_id
                          WHERE t.project_id = p.id AND t.billable
                            AND COALESCE(dct.criacao_efetiva, p.criado_em, p.created_at) >= _ini
                            AND COALESCE(dct.criacao_efetiva, p.criado_em, p.created_at) <  _fim),
               'entregas', (SELECT COUNT(*) FROM public.deliverables d
                             JOIN public.deliverables_criacao dc2 ON dc2.id = d.id
                             WHERE d.project_id = p.id
                               AND dc2.criacao_efetiva >= _ini AND dc2.criacao_efetiva < _fim
                               AND d.status NOT IN ('reprovado', 'cancelado'))
             ) AS x
      FROM public.projects p
      WHERE p.client_id = c.client_id AND p.faturamento = 'avulso'
        AND (
          EXISTS (SELECT 1 FROM public.time_entries t2
                   LEFT JOIN public.deliverables_criacao dc3 ON dc3.id = t2.deliverable_id
                   WHERE t2.project_id = p.id AND t2.billable
                     AND COALESCE(dc3.criacao_efetiva, p.criado_em, p.created_at) >= _ini
                     AND COALESCE(dc3.criacao_efetiva, p.criado_em, p.created_at) <  _fim)
          OR EXISTS (SELECT 1 FROM public.deliverables d2
                      JOIN public.deliverables_criacao dc4 ON dc4.id = d2.id
                      WHERE d2.project_id = p.id
                        AND dc4.criacao_efetiva >= _ini AND dc4.criacao_efetiva < _fim
                        AND d2.status NOT IN ('reprovado', 'cancelado'))
        )
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
               'percent', x.percent,        -- 100 cheio | 50 meia | 0 brinde
               'horas', x.horas,            -- realizado na peça (edição + alteração)
               'horas_ref', x.horas_ref     -- o que a tabela previa pra esse tipo
             ) ORDER BY x.data_entrega), '[]'::jsonb),
             COALESCE(SUM(COALESCE(x.preco, 0)), 0)
        INTO _itens, _subtotal
      FROM (
        SELECT d.id, d.titulo, d.formato, d.duracao, d.data_entrega,
               COALESCE(esc.tipo, nome.tipo, hr.tipo)                  AS tipo,
               -- A proporção multiplica o preço do tipo. Recorte de material
               -- já editado sai por metade: teve trabalho, só não teve o
               -- trabalho inteiro. 0 continua possível pra quando é de fato
               -- brinde, mas deixou de ser o único caminho.
               ROUND(COALESCE(esc.preco, nome.preco, hr.preco, 0)
                     * COALESCE(d.cobranca_percent, 100) / 100.0, 2)       AS preco,
               COALESCE(d.cobranca_percent, 100)                           AS percent,
               COALESCE(esc.horas_ref, nome.horas_ref, hr.horas_ref)       AS horas_ref,
               CASE WHEN esc.tipo IS NOT NULL THEN 'escolhido'
                    WHEN nome.tipo IS NOT NULL THEN 'nome'
                    WHEN hr.tipo   IS NOT NULL THEN 'horas'
                    ELSE 'nenhum' END AS origem,
               h.horas
        FROM public.deliverables d
        JOIN public.projects p ON p.id = d.project_id
        JOIN public.deliverables_criacao dc ON dc.id = d.id

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
          -- Corte por CRIAÇÃO, não por entrega: a peça pertence ao mês em que
          -- o job entrou. Entrega escorrega; criação não.
          AND dc.criacao_efetiva >= _ini AND dc.criacao_efetiva < _fim
          AND d.status NOT IN ('reprovado', 'cancelado')
      ) x;

    ELSIF c.modelo = 'contrato' THEN
      _valor_hora := 0;
      SELECT * INTO _ctr FROM public.client_contratos
        WHERE client_id = c.client_id AND ativo ORDER BY created_at DESC LIMIT 1;
      _subtotal := COALESCE(_ctr.valor_mensal, 0);

      -- Um dia é UM dia: dois projetos do mesmo cliente gravados no mesmo
      -- dia consomem uma diária, não duas. A fração vale a maior do dia
      -- (cheia ganha de meia) — a equipe saiu uma vez.
      SELECT COALESCE(SUM(x.fracao), 0) INTO _diarias_usadas
      FROM (
        SELECT s.data, MAX(s.fracao) AS fracao
        FROM public.producao_saidas s JOIN public.projects p ON p.id = s.project_id
        WHERE p.client_id = c.client_id AND p.faturamento = 'mensal'
          AND s.tipo = 'diaria' AND s.status <> 'cancelada'
          AND s.data >= _ini AND s.data < _fim
        GROUP BY s.data
      ) x;
      SELECT COUNT(*) INTO _entregas_usadas
      FROM public.deliverables d JOIN public.projects p ON p.id = d.project_id
      JOIN public.deliverables_criacao dc ON dc.id = d.id
      WHERE p.client_id = c.client_id AND p.faturamento = 'mensal'
        AND dc.criacao_efetiva >= _ini AND dc.criacao_efetiva < _fim
        AND d.status NOT IN ('reprovado', 'cancelado');

      _jan_ini := (_ini - ((COALESCE(_ctr.acumulo_meses, 1) - 1) || ' months')::interval)::date;
      SELECT COALESCE(SUM(x.fracao), 0) INTO _diarias_jan
      FROM (
        SELECT s.data, MAX(s.fracao) AS fracao
        FROM public.producao_saidas s JOIN public.projects p ON p.id = s.project_id
        WHERE p.client_id = c.client_id AND p.faturamento = 'mensal'
          AND s.tipo = 'diaria' AND s.status <> 'cancelada'
          AND s.data >= _jan_ini AND s.data < _fim
        GROUP BY s.data
      ) x;
      SELECT COUNT(*) INTO _entregas_jan
      FROM public.deliverables d JOIN public.projects p ON p.id = d.project_id
      JOIN public.deliverables_criacao dc ON dc.id = d.id
      WHERE p.client_id = c.client_id AND p.faturamento = 'mensal'
        AND dc.criacao_efetiva >= _jan_ini AND dc.criacao_efetiva < _fim
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

    -- ---------- Diárias: o dia e os custos do dia ----------
    -- O DIA é serviço: vale o preço da linha marcada como diária na tabela
    -- do cliente (no Sicredi Região, "Captação"). Os CUSTOS do dia são
    -- repasse e entram com margem própria. São duas coisas e somam as duas.
    SELECT cp.preco INTO _valor_diaria
    FROM public.client_precos cp
    WHERE cp.client_id = c.client_id AND cp.ativo AND cp.e_diaria
    ORDER BY cp.ordem LIMIT 1;

    SELECT COALESCE(SUM(fracao), 0) INTO _diarias_qtd
    FROM public.diarias_por_dia
    WHERE client_id = c.client_id AND data >= _ini AND data < _fim;

    -- Saldo de DIÁRIAS abate em diária, não em dinheiro: quem tem meia
    -- diária a usar e gravou uma, paga meia.
    SELECT COALESCE(diarias, 0) INTO _saldo_diarias
    FROM public.client_saldo WHERE client_id = c.client_id;
    _saldo_diarias := GREATEST(0, COALESCE(_saldo_diarias, 0));
    _diarias_cobradas := GREATEST(0, _diarias_qtd - _saldo_diarias);
    _diarias_valor := ROUND(COALESCE(_valor_diaria, 0) * _diarias_cobradas, 2);
    _subtotal := _subtotal + _diarias_valor;

    -- Os CUSTOS do dia (logística, alimentação, hospedagem) somam à parte:
    -- margem própria (menor, é repasse) e o imposto do cliente quando cabe.
    SELECT COALESCE(SUM(
             (d.custo_logistica + d.custo_alimentacao + d.custo_hospedagem)
             * (1 + COALESCE(c.margem_diaria_percent, 15) / 100)
             * (1 + CASE WHEN c.precos_finais THEN 0 ELSE COALESCE(c.imposto_percent, 0) END / 100)
           ), 0)
      INTO _diarias_repasse
    FROM public.diarias_por_dia d
    WHERE d.client_id = c.client_id AND d.data >= _ini AND d.data < _fim;
    _diarias_repasse := ROUND(COALESCE(_diarias_repasse, 0), 2);
    _subtotal := _subtotal + _diarias_repasse;

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

    -- Preço final: a comissão sai POR DENTRO. O cliente combinou R$ 440 pela
    -- Pílula; somar 4% de comissão interna por cima cobraria R$ 457,60 e
    -- quebraria o acordo. O valor continua registrado — é quanto sai do
    -- faturamento pra comissão — mas não muda o que o cliente paga.
    _total   := _subtotal + _margem + _imposto
              + CASE WHEN c.precos_finais THEN 0 ELSE _comissao END;

    -- Saldo A USAR abate a conta do mês. Só o que couber: saldo maior que a
    -- fatura não vira crédito negativo aqui — o resto continua no extrato do
    -- cliente, pro mês seguinte.
    _saldo_usado := '{}'::jsonb;
    IF _total > 0 THEN
      DECLARE _saldo numeric;
      BEGIN
        SELECT COALESCE(valor, 0) INTO _saldo
        FROM public.client_saldo WHERE client_id = c.client_id;
        IF COALESCE(_saldo, 0) > 0 THEN
          _saldo_usado := jsonb_build_object(
            'disponivel', _saldo,
            'usado', LEAST(_saldo, _total),
            'sobra', GREATEST(0, _saldo - _total)
          );
          _total := _total - LEAST(_saldo, _total);
        END IF;
      END;
    END IF;

    -- saúde: contrato/tabela × quanto renderia por horas ao nosso valor de tabela
    _saude := jsonb_build_object(
      'valor_hora_referencia', _ref_rate,
      'horas_total', _h_tot,
      'valor_equivalente_horas', ROUND(_h_tot * _ref_rate, 2),
      'valor_cobrado', _total,
      'diferenca', ROUND(_total - _h_tot * _ref_rate, 2)
    );

    -- Diárias do mês com os custos do dia. O repasse leva margem PRÓPRIA
    -- (15% por padrão, menor que a de produção — é repasse, não trabalho) e
    -- o imposto do cliente por cima.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'data', d.data, 'fracao', d.fracao, 'projetos', d.projetos,
             -- Os ids das saídas do dia. Sem eles a tela mostra os campos de
             -- custo e não tem onde gravar — foi exatamente o que aconteceu:
             -- os campos apareceram travados e o Djêisson não conseguiu
             -- lançar nada.
             'saida_ids', d.saida_ids,
             'custos_itens', d.custos_itens,
             'logistica', d.custo_logistica,
             'alimentacao', d.custo_alimentacao,
             'hospedagem', d.custo_hospedagem,
             'custo', d.custo_logistica + d.custo_alimentacao + d.custo_hospedagem,
             'repasse', ROUND(
               (d.custo_logistica + d.custo_alimentacao + d.custo_hospedagem)
               * (1 + COALESCE(c.margem_diaria_percent, 15) / 100)
               * (1 + CASE WHEN c.precos_finais THEN 0 ELSE COALESCE(c.imposto_percent, 0) END / 100), 2)
           ) ORDER BY d.data), '[]'::jsonb)
      INTO _diarias_det
    FROM public.diarias_por_dia d
    WHERE d.client_id = c.client_id AND d.data >= _ini AND d.data < _fim;

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
      'diarias', _diarias_det,
      'diarias_repasse', _diarias_repasse,
      'diarias_qtd', _diarias_qtd,
      'diarias_cobradas', _diarias_cobradas,
      'diarias_valor_unitario', COALESCE(_valor_diaria, 0),
      'diarias_valor', _diarias_valor,
      'diarias_saldo_abatido', LEAST(_saldo_diarias, _diarias_qtd),
      'saldo', _saldo_usado,
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
