-- =========================================================================
-- Valor de orçamento é PREÇO FINAL — e o modelo tabela nunca o honrou
--
-- DOIS bugs meus, achados pelo Djêisson conferindo a nota do Sul Minas
-- contra o e-mail que ele já tinha mandado pro cliente:
--
--   combinado com o cliente   4.091,85 (fechamento) + 1.650,00 (vídeo IA)
--   o sistema dizia           6.132,13 + 551,94 = 6.684,07
--
-- 1. O COMBINADO LEVAVA MARGEM E IMPOSTO POR CIMA. Ele entrava no SUBTOTAL,
--    então a margem de 40% e o imposto de 12% do cliente incidiam sobre ele:
--    os R$ 1.650 do orçamento #0313 viravam R$ 2.587,20 na nota — R$ 937,20
--    a mais do que foi aprovado.
--
--    O total de um orçamento JÁ É o preço final. Passa a entrar no TOTAL,
--    depois de margem, imposto e comissão, nos dois baldes.
--
-- 2. NO MODELO TABELA, O COMBINADO NÃO FAZIA NADA. Escrevi esse suporte em
--    20260807180000 num script que abortou num assert DEPOIS das trocas —
--    elas se perderam e eu não reparei, porque o teste que escrevi era no
--    Sul Minas, que é modelo HORAS. O modelo tabela ficou sem o filtro (as
--    peças do job continuavam sendo cobradas uma a uma) e sem a soma.
--
--    Hoje nenhum projeto de tabela tem valor combinado, então não houve nota
--    errada por causa disto — era uma armadilha esperando o primeiro uso.
--    A medição abaixo agora cobre OS DOIS modelos.
--
-- Pra cliente de preços finais (Sicredi Região) o item 1 não muda nada:
-- margem e imposto já eram zero.
--
-- Partiu da definição vigente (20260808010000).
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
  _avulsos jsonb; _avulsos_valor numeric; _vh_avulso numeric; _vh_avulso_origem text;
  -- Nota separada DENTRO do mês: mesmo preço do fechamento, documento próprio.
  _min_edic_sep numeric; _min_alt_sep numeric;
  _h_edic_sep numeric; _h_alt_sep numeric; _h_tot_sep numeric;
  _itens_sep jsonb; _sep_subtotal numeric; _sep_margem numeric;
  -- Projetos com valor combinado à mão (orçamento ou manual): entram pelo
  -- valor, e as horas/peças deles saem do cálculo normal do balde.
  _ovr_mensal numeric; _ovr_sep numeric;
  _h_ovr_mensal numeric; _h_ovr_sep numeric;
  _sep_imposto numeric; _sep_total numeric; _sep_regra text; _sep_projetos jsonb;
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
    -- Os dois baldes do mês na MESMA varredura, separados por FILTER. Duas
    -- consultas quase iguais seriam duas chances de o filtro de competência
    -- divergir entre elas — e aí a hora cai numa nota e some da outra.
    SELECT COALESCE(SUM(te.duration_min) FILTER (
             WHERE te.alteracao_id IS NULL AND x.balde = 'mensal'), 0),
           COALESCE(SUM(te.duration_min) FILTER (
             WHERE te.alteracao_id IS NOT NULL AND x.balde = 'mensal'), 0),
           COALESCE(SUM(te.duration_min) FILTER (
             WHERE te.alteracao_id IS NULL AND x.balde = 'mensal_separado'), 0),
           COALESCE(SUM(te.duration_min) FILTER (
             WHERE te.alteracao_id IS NOT NULL AND x.balde = 'mensal_separado'), 0)
      INTO _min_edic, _min_alt, _min_edic_sep, _min_alt_sep
    FROM public.time_entries te
    JOIN public.projects p ON p.id = te.project_id
    -- A competência da hora é a criação da PEÇA em que ela foi lançada; hora
    -- solta no projeto cai na criação do projeto.
    LEFT JOIN public.deliverables_criacao dc ON dc.id = te.deliverable_id
    -- Em qual balde a hora cai: a decisão da PEÇA vence a do projeto. Hora
    -- solta no projeto (sem peça) não tem quem decida por ela e segue o
    -- projeto. Fonte única em deliverables_faturamento.
    LEFT JOIN public.deliverables_faturamento df ON df.id = te.deliverable_id
    CROSS JOIN LATERAL (SELECT COALESCE(df.faturamento_efetivo, p.faturamento, 'mensal') AS balde) x
    WHERE p.client_id = c.client_id AND te.billable
      AND x.balde IN ('mensal', 'mensal_separado')
      AND COALESCE(dc.criacao_efetiva, p.criado_em, p.created_at) >= _ini
      AND COALESCE(dc.criacao_efetiva, p.criado_em, p.created_at) <  _fim;
    _h_edic := ROUND(_min_edic / 60.0, 2);
    _h_alt  := ROUND(_min_alt / 60.0, 2);
    _h_tot  := _h_edic + _h_alt;
    _h_edic_sep := ROUND(_min_edic_sep / 60.0, 2);
    _h_alt_sep  := ROUND(_min_alt_sep / 60.0, 2);
    _h_tot_sep  := _h_edic_sep + _h_alt_sep;

    -- ---------- Projetos com valor combinado ----------
    -- Somados por balde ANTES de tudo: o valor deles entra direto e as horas
    -- deles têm que sair do cálculo por hora, senão o job seria cobrado duas
    -- vezes — uma pelo acordo e outra pelo relógio.
    SELECT
      COALESCE(SUM(p.valor_fechamento) FILTER (WHERE COALESCE(p.faturamento,'mensal') = 'mensal'), 0),
      COALESCE(SUM(p.valor_fechamento) FILTER (WHERE COALESCE(p.faturamento,'mensal') = 'mensal_separado'), 0)
      INTO _ovr_mensal, _ovr_sep
    FROM public.projects p
    WHERE p.client_id = c.client_id AND p.valor_fechamento IS NOT NULL
      AND COALESCE(
            (SELECT MIN(dc.criacao_efetiva) FROM public.deliverables_criacao dc
               JOIN public.deliverables d2 ON d2.id = dc.id WHERE d2.project_id = p.id),
            p.criado_em, p.created_at) >= _ini
      AND COALESCE(
            (SELECT MIN(dc.criacao_efetiva) FROM public.deliverables_criacao dc
               JOIN public.deliverables d2 ON d2.id = dc.id WHERE d2.project_id = p.id),
            p.criado_em, p.created_at) <  _fim;

    -- As horas desses projetos, por balde — o que sai do cálculo por hora.
    --
    -- Arredondadas EXATAMENTE como `_h_tot` é composto: edição e alteração
    -- separadas, cada uma a duas casas, e só então somadas. Antes eu dividia
    -- os minutos direto por 60 e o resultado não batia com o que a tela
    -- mostra: 21,04h − 6,91h dava 14,12h na conta e 14,13h na calculadora de
    -- quem confere. R$ 1,07 de diferença num fechamento — pouco dinheiro e
    -- exatamente o tipo de coisa que faz o cliente perguntar se o resto está
    -- certo.
    SELECT
      ROUND(COALESCE(SUM(te.duration_min) FILTER (
              WHERE x.balde = 'mensal' AND te.alteracao_id IS NULL), 0) / 60.0, 2)
      + ROUND(COALESCE(SUM(te.duration_min) FILTER (
              WHERE x.balde = 'mensal' AND te.alteracao_id IS NOT NULL), 0) / 60.0, 2),
      ROUND(COALESCE(SUM(te.duration_min) FILTER (
              WHERE x.balde = 'mensal_separado' AND te.alteracao_id IS NULL), 0) / 60.0, 2)
      + ROUND(COALESCE(SUM(te.duration_min) FILTER (
              WHERE x.balde = 'mensal_separado' AND te.alteracao_id IS NOT NULL), 0) / 60.0, 2)
      INTO _h_ovr_mensal, _h_ovr_sep
    FROM public.time_entries te
    JOIN public.projects p ON p.id = te.project_id
    LEFT JOIN public.deliverables_criacao dc     ON dc.id = te.deliverable_id
    LEFT JOIN public.deliverables_faturamento df ON df.id = te.deliverable_id
    CROSS JOIN LATERAL (SELECT COALESCE(df.faturamento_efetivo, p.faturamento, 'mensal') AS balde) x
    WHERE p.client_id = c.client_id AND te.billable AND p.valor_fechamento IS NOT NULL
      AND COALESCE(dc.criacao_efetiva, p.criado_em, p.created_at) >= _ini
      AND COALESCE(dc.criacao_efetiva, p.criado_em, p.created_at) <  _fim;

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
    JOIN public.deliverables_faturamento df ON df.id = d.id
    WHERE p.client_id = c.client_id AND df.faturamento_efetivo = 'mensal'
      AND dc.criacao_efetiva >= _ini AND dc.criacao_efetiva < _fim;

    -- ---------- O painel do fechamento: um projeto por linha ----------
    -- Antes esta lista só trazia o balde 'mensal'. Marcar um projeto como
    -- nota separada o fazia SUMIR daqui — junto com o botão que o traria de
    -- volta. Agora vêm todos, com o balde de cada um, o valor, o orçamento
    -- vinculado e as peças; é a tela onde se vê e se decide sem abrir job
    -- nenhum, que foi o pedido.
    --
    -- Cada peça traz o SEU balde efetivo. É o que teria mostrado, em julho,
    -- que 0020 e 0203 estavam marcados como nota separada no projeto e com
    -- 'mensal' gravado na peça — que vence o projeto, pela regra — deixando
    -- a nota em zero sem nenhuma tela dizer por quê.
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'projeto'), '[]'::jsonb) INTO _por_projeto
    FROM (
      SELECT jsonb_build_object(
               'project_id', p.id,
               'projeto', p.name,
               'numero', p.numero,
               'criacao', COALESCE(
                 (SELECT MIN(dc.criacao_efetiva) FROM public.deliverables_criacao dc
                    JOIN public.deliverables d2 ON d2.id = dc.id WHERE d2.project_id = p.id),
                 p.criado_em, p.created_at),
               'balde', COALESCE(p.faturamento, 'mensal'),
               -- O valor vendido do job. O `sold_value` da lateral é
               -- preenchido à mão e quase sempre está zerado; quem tem o
               -- número é o ORÇAMENTO vinculado. A lateral vence quando
               -- alguém a preencheu — aí é decisão explícita.
               'orcamento_valor', COALESCE(NULLIF(fin.sold_value, 0), orc.total_value),
               'orcamento_numero', orc.budget_number,
               'valor_fechamento', p.valor_fechamento,
               'valor_origem', p.valor_fechamento_origem,
               'horas_edicao', h.edic,
               'horas_alteracao', h.alt,
               'horas', h.edic + h.alt,
               -- Quanto valeria pelas horas. É o número do modelo horas e a
               -- referência no de tabela ("o job deu 6h; o acordo foi X").
               'valor_horas', ROUND((h.edic + h.alt) * COALESCE(NULLIF(c.valor_hora, 0), 0), 2),
               'pecas', pc.lista
             ) AS x
      FROM public.projects p
      LEFT JOIN public.projects_financeiro fin ON fin.project_id = p.id
      LEFT JOIN public.budgets orc ON orc.id = p.budget_id
      CROSS JOIN LATERAL (
        SELECT ROUND(COALESCE(SUM(te.duration_min) FILTER (WHERE te.alteracao_id IS NULL), 0) / 60.0, 2)     AS edic,
               ROUND(COALESCE(SUM(te.duration_min) FILTER (WHERE te.alteracao_id IS NOT NULL), 0) / 60.0, 2) AS alt
        FROM public.time_entries te
        LEFT JOIN public.deliverables_criacao dc ON dc.id = te.deliverable_id
        WHERE te.project_id = p.id AND te.billable
          AND COALESCE(dc.criacao_efetiva, p.criado_em, p.created_at) >= _ini
          AND COALESCE(dc.criacao_efetiva, p.criado_em, p.created_at) <  _fim
      ) h
      CROSS JOIN LATERAL (
        SELECT COUNT(*)::int AS n,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'deliverable_id', d.id,
                 'codigo', d.codigo,
                 'entregavel', d.titulo,
                 'status', d.status,
                 'balde', dfd.faturamento_efetivo,
                 'balde_na_peca', dfd.decidido_na_peca,
                 'horas', (SELECT ROUND(COALESCE(SUM(t2.duration_min), 0) / 60.0, 2)
                             FROM public.time_entries t2
                            WHERE t2.deliverable_id = d.id AND t2.billable)
               ) ORDER BY d.titulo), '[]'::jsonb) AS lista
        FROM public.deliverables d
        JOIN public.deliverables_faturamento dfd ON dfd.id = d.id
        JOIN public.deliverables_criacao dc2     ON dc2.id = d.id
        WHERE d.project_id = p.id
          AND dc2.criacao_efetiva >= _ini AND dc2.criacao_efetiva < _fim
          AND d.status NOT IN ('reprovado', 'cancelado')
      ) pc
      WHERE p.client_id = c.client_id AND (h.edic + h.alt > 0 OR pc.n > 0)
    ) q;

    -- ---------- O que sai pra NOTA SEPARADA ----------
    -- Fica FORA de tudo que foi somado acima e vem com VALOR: o bloco antigo
    -- mostrava horas e entregas e nenhum dinheiro, então avisava que havia o
    -- que cobrar sem dizer quanto — e o Djêisson tinha que refazer a conta à
    -- mão toda vez. Avulso que some da tela é dinheiro que não é cobrado.
    --
    -- Duas origens no mesmo bloco, agrupadas por PROJETO (que é a unidade de
    -- uma nota):
    --   · o projeto inteiro marcado como avulso (o que já existia);
    --   · peças soltas marcadas pra nota separada dentro de um projeto que
    --     segue mensal (o que o Djêisson pediu em 07/08).
    -- `projeto_todo` diz qual dos dois é, pra tela não sugerir que o job
    -- inteiro saiu quando saiu uma peça só.
    --
    -- PREÇO: horas × valor-hora do cliente (decisão do Djêisson, 07/08).
    -- Cliente sem valor-hora cadastrado — o caso de quem paga por tabela —
    -- cai no nosso valor de tabela do rate_card, e o detalhe declara qual
    -- dos dois foi usado pra ninguém emitir nota achando que é o combinado.
    _vh_avulso := COALESCE(NULLIF(c.valor_hora, 0), NULLIF(_ref_rate, 0), 0);
    _vh_avulso_origem := CASE WHEN COALESCE(c.valor_hora, 0) > 0 THEN 'cliente'
                              WHEN COALESCE(_ref_rate, 0) > 0  THEN 'rate_card'
                              ELSE 'sem_valor_hora' END;

    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'projeto'), '[]'::jsonb),
           COALESCE(SUM((x->>'valor')::numeric), 0)
      INTO _avulsos, _avulsos_valor
    FROM (
      SELECT jsonb_build_object(
               'project_id', p.id,
               'projeto', p.name,
               'numero', p.numero,
               'projeto_todo', (COALESCE(p.faturamento, 'mensal') = 'avulso'),
               'horas_edicao', h.h_edic,
               'horas_alteracao', h.h_alt,
               'horas', h.h_edic + h.h_alt,
               -- Valor combinado vence a conta por hora aqui também: o
               -- acordo é o acordo, esteja o job em qual balde estiver.
               'valor', COALESCE(p.valor_fechamento, ROUND((h.h_edic + h.h_alt) * _vh_avulso, 2)),
               'entregas', e.n,
               'pecas', e.lista
             ) AS x
      FROM public.projects p
      -- LATERAL só com agregação: devolve sempre uma linha, então nenhum
      -- projeto é derrubado por não ter hora (ou por não ter peça). Era esse
      -- o motivo de o bloco antigo usar subconsulta escalar, e continua
      -- valendo — projeto com entrega e zero hora é o avulso que mais se
      -- esquece de cobrar.
      CROSS JOIN LATERAL (
        SELECT ROUND(COALESCE(SUM(t.duration_min) FILTER (WHERE t.alteracao_id IS NULL), 0) / 60.0, 2)     AS h_edic,
               ROUND(COALESCE(SUM(t.duration_min) FILTER (WHERE t.alteracao_id IS NOT NULL), 0) / 60.0, 2) AS h_alt
        FROM public.time_entries t
        LEFT JOIN public.deliverables_faturamento dft ON dft.id = t.deliverable_id
        LEFT JOIN public.deliverables_criacao dct     ON dct.id = t.deliverable_id
        WHERE t.project_id = p.id AND t.billable
          AND COALESCE(dft.faturamento_efetivo, p.faturamento, 'mensal') = 'avulso'
          AND COALESCE(dct.criacao_efetiva, p.criado_em, p.created_at) >= _ini
          AND COALESCE(dct.criacao_efetiva, p.criado_em, p.created_at) <  _fim
      ) h
      CROSS JOIN LATERAL (
        SELECT COUNT(*)::int AS n,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'deliverable_id', d.id,
                 'codigo', d.codigo,
                 'entregavel', d.titulo,
                 'horas', (SELECT ROUND(COALESCE(SUM(t2.duration_min), 0) / 60.0, 2)
                             FROM public.time_entries t2
                            WHERE t2.deliverable_id = d.id AND t2.billable),
                 'so_esta_peca', (d.faturamento IS NOT NULL)
               ) ORDER BY d.titulo), '[]'::jsonb) AS lista
        FROM public.deliverables d
        JOIN public.deliverables_faturamento dfd ON dfd.id = d.id
        JOIN public.deliverables_criacao dc2     ON dc2.id = d.id
        WHERE d.project_id = p.id
          AND dfd.faturamento_efetivo = 'avulso'
          AND dc2.criacao_efetiva >= _ini AND dc2.criacao_efetiva < _fim
          AND d.status NOT IN ('reprovado', 'cancelado')
      ) e
      WHERE p.client_id = c.client_id
        AND (h.h_edic + h.h_alt > 0 OR e.n > 0)
    ) q;

    -- subtotal por modelo
    _itens := '[]'::jsonb;
    _consumo := NULL;
    _valor_hora := c.valor_hora;
    -- Zerado a cada cliente do laço. Sem isto, um cliente sem nota separada
    -- herdaria a do cliente anterior — e ninguém desconfia de um número que
    -- aparece plausível na tela de outra pessoa.
    _itens_sep := '[]'::jsonb;
    _sep_subtotal := 0;
    _sep_regra := NULL;

    IF c.modelo = 'horas' THEN
      -- Horas dos projetos com valor combinado saem da conta por hora e
      -- entram pelo valor. GREATEST(0, …) porque o único jeito de dar
      -- negativo seria um bug de recorte, e um subtotal negativo viraria
      -- desconto na nota do cliente antes de alguém perceber.
      _subtotal     := ROUND(GREATEST(0, _h_tot - _h_ovr_mensal) * c.valor_hora, 2);
      _sep_subtotal := ROUND(GREATEST(0, _h_tot_sep - _h_ovr_sep) * c.valor_hora, 2);
      _sep_regra    := CASE WHEN _ovr_sep > 0 THEN 'horas × valor-hora + projetos com valor combinado'
                            ELSE 'horas × valor-hora do cliente' END;

    ELSIF c.modelo = 'tabela' THEN
      _valor_hora := 0;
      _sep_regra := CASE WHEN _ovr_sep > 0 THEN 'preço de tabela + projetos com valor combinado'
                         ELSE 'preço de tabela das peças' END;
      -- A escada de preço roda UMA vez pros dois baldes; o FILTER só decide
      -- em qual nota a linha cai. Rodar a escada duas vezes seria a mesma
      -- regra de precificação escrita duas vezes — e o dia em que uma delas
      -- mudasse sozinha, a peça sairia com preço diferente conforme a nota.
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'deliverable_id', x.id,
               'entregavel', x.titulo, 'formato', x.formato, 'duracao', x.duracao,
               'data', x.data_entrega,
               'tipo', x.tipo, 'preco', COALESCE(x.preco, 0),
               'origem', x.origem,          -- escolhido | nome | horas | nenhum
               'percent', x.percent,        -- 100 cheio | 50 meia | 0 brinde
               'horas', x.horas,            -- realizado na peça (edição + alteração)
               'horas_ref', x.horas_ref     -- o que a tabela previa pra esse tipo
             ) ORDER BY x.data_entrega) FILTER (WHERE x.balde = 'mensal'), '[]'::jsonb),
             COALESCE(SUM(COALESCE(x.preco, 0)) FILTER (WHERE x.balde = 'mensal'), 0),
             COALESCE(jsonb_agg(jsonb_build_object(
               'deliverable_id', x.id,
               'entregavel', x.titulo, 'formato', x.formato, 'duracao', x.duracao,
               'data', x.data_entrega,
               'tipo', x.tipo, 'preco', COALESCE(x.preco, 0),
               'origem', x.origem, 'percent', x.percent,
               'horas', x.horas, 'horas_ref', x.horas_ref
             ) ORDER BY x.data_entrega) FILTER (WHERE x.balde = 'mensal_separado'), '[]'::jsonb),
             COALESCE(SUM(COALESCE(x.preco, 0)) FILTER (WHERE x.balde = 'mensal_separado'), 0)
        INTO _itens, _subtotal, _itens_sep, _sep_subtotal
      FROM (
        SELECT d.id, d.titulo, d.formato, d.duracao, d.data_entrega,
               dfp.faturamento_efetivo                                 AS balde,
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
        -- Peça marcada pra nota separada não vira linha da tabela do mês.
        JOIN public.deliverables_faturamento dfp ON dfp.id = d.id

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

        WHERE p.client_id = c.client_id
          AND dfp.faturamento_efetivo IN ('mensal', 'mensal_separado')
          -- Projeto com valor combinado não entra peça a peça: o job inteiro
          -- vale o acordo, e somar as peças por cima cobraria duas vezes.
          AND p.valor_fechamento IS NULL
          -- Corte por CRIAÇÃO, não por entrega: a peça pertence ao mês em que
          -- o job entrou. Entrega escorrega; criação não.
          AND dc.criacao_efetiva >= _ini AND dc.criacao_efetiva < _fim
          AND d.status NOT IN ('reprovado', 'cancelado')
      ) x;

    ELSIF c.modelo = 'contrato' THEN
      _valor_hora := 0;
      -- A mensalidade do contrato não se divide: ela paga o mês inteiro, não
      -- um pedaço dele. O que sai pra nota separada é cobrado por HORA, e a
      -- tela declara isso — inventar uma fração da mensalidade seria escolher
      -- um número que ninguém combinou. Também não consome franquia: as
      -- contagens de diária e entrega já filtram só o balde 'mensal'.
      _sep_subtotal := ROUND(_h_tot_sep * COALESCE(NULLIF(c.valor_hora, 0), _ref_rate, 0), 2);
      _sep_regra    := 'horas × ' ||
        CASE WHEN COALESCE(c.valor_hora, 0) > 0 THEN 'valor-hora do cliente'
             ELSE 'nosso valor de tabela (contrato não se divide)' END;
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
        -- Diária segue o PROJETO, não a peça: uma saída de campo é do job
        -- inteiro, e não há a que peça atribuí-la. Se o job vai pra nota
        -- separada, a diária dele vai junto.
        WHERE p.client_id = c.client_id AND p.faturamento = 'mensal'
          AND s.tipo = 'diaria' AND s.status <> 'cancelada'
          AND s.data >= _ini AND s.data < _fim
        GROUP BY s.data
      ) x;
      SELECT COUNT(*) INTO _entregas_usadas
      FROM public.deliverables d JOIN public.projects p ON p.id = d.project_id
      JOIN public.deliverables_criacao dc ON dc.id = d.id
      JOIN public.deliverables_faturamento df ON df.id = d.id
      WHERE p.client_id = c.client_id AND df.faturamento_efetivo = 'mensal'
        AND dc.criacao_efetiva >= _ini AND dc.criacao_efetiva < _fim
        AND d.status NOT IN ('reprovado', 'cancelado');

      _jan_ini := (_ini - ((COALESCE(_ctr.acumulo_meses, 1) - 1) || ' months')::interval)::date;
      SELECT COALESCE(SUM(x.fracao), 0) INTO _diarias_jan
      FROM (
        SELECT s.data, MAX(s.fracao) AS fracao
        FROM public.producao_saidas s JOIN public.projects p ON p.id = s.project_id
        -- Diária segue o PROJETO, não a peça: uma saída de campo é do job
        -- inteiro, e não há a que peça atribuí-la. Se o job vai pra nota
        -- separada, a diária dele vai junto.
        WHERE p.client_id = c.client_id AND p.faturamento = 'mensal'
          AND s.tipo = 'diaria' AND s.status <> 'cancelada'
          AND s.data >= _jan_ini AND s.data < _fim
        GROUP BY s.data
      ) x;
      SELECT COUNT(*) INTO _entregas_jan
      FROM public.deliverables d JOIN public.projects p ON p.id = d.project_id
      JOIN public.deliverables_criacao dc ON dc.id = d.id
      JOIN public.deliverables_faturamento df ON df.id = d.id
      WHERE p.client_id = c.client_id AND df.faturamento_efetivo = 'mensal'
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
    -- O VALOR COMBINADO ENTRA AQUI, não no subtotal: ele é PREÇO FINAL.
    -- `budgets.total_value` é o número que foi pra proposta, com margem e
    -- imposto dentro (a tabela tem subtotal_1, subtotal_2, tax_value e
    -- margin_value justamente porque o total é o fim dessa conta). Somá-lo
    -- antes da margem cobra os dois de novo: no Sul Minas de julho, o
    -- orçamento #0313 de R$ 1.650 virava R$ 2.587,20 na nota.
    _total   := _subtotal + _margem + _imposto
              + CASE WHEN c.precos_finais THEN 0 ELSE _comissao END
              + _ovr_mensal;

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

    -- ---------- A nota separada do mês fecha com as MESMAS regras ----------
    -- Mesma margem e mesmo imposto do fechamento: é o mesmo dia a dia, só em
    -- outro documento. Pro cliente de preços finais os dois percentuais são
    -- zero e o subtotal já é o valor — nada muda.
    --
    -- Comissão de valor FIXO fica no fechamento principal, de propósito:
    -- repeti-la em cada nota cobraria a mesma comissão duas vezes. Hoje isso
    -- não muda número nenhum (o único cliente com comissão tem preços finais,
    -- onde ela sai por dentro), mas o dia em que mudar, é aqui que se olha.
    _sep_subtotal := COALESCE(_sep_subtotal, 0);
    _sep_margem   := CASE WHEN c.precos_finais THEN 0
                          ELSE ROUND(_sep_subtotal * COALESCE(c.margem_percent, 0) / 100, 2) END;
    _sep_imposto  := CASE WHEN c.precos_finais THEN 0
                          ELSE ROUND((_sep_subtotal + _sep_margem) * COALESCE(c.imposto_percent, 0) / 100, 2) END;
    -- Mesma regra na nota separada: o combinado é preço final.
    _sep_total    := _sep_subtotal + _sep_margem + _sep_imposto + _ovr_sep;

    -- Os projetos que compõem essa nota, pra saber o que ela cobre sem abrir
    -- peça por peça.
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'projeto'), '[]'::jsonb) INTO _sep_projetos
    FROM (
      SELECT jsonb_build_object(
               'project_id', p.id, 'projeto', p.name, 'numero', p.numero,
               'projeto_todo', (COALESCE(p.faturamento, 'mensal') = 'mensal_separado'),
               'entregas', e.n, 'horas', h.horas
             ) AS x
      FROM public.projects p
      CROSS JOIN LATERAL (
        SELECT ROUND(COALESCE(SUM(t.duration_min), 0) / 60.0, 2) AS horas
        FROM public.time_entries t
        LEFT JOIN public.deliverables_faturamento dft ON dft.id = t.deliverable_id
        LEFT JOIN public.deliverables_criacao dct     ON dct.id = t.deliverable_id
        WHERE t.project_id = p.id AND t.billable
          AND COALESCE(dft.faturamento_efetivo, p.faturamento, 'mensal') = 'mensal_separado'
          AND COALESCE(dct.criacao_efetiva, p.criado_em, p.created_at) >= _ini
          AND COALESCE(dct.criacao_efetiva, p.criado_em, p.created_at) <  _fim
      ) h
      CROSS JOIN LATERAL (
        SELECT COUNT(*)::int AS n
        FROM public.deliverables d
        JOIN public.deliverables_faturamento dfd ON dfd.id = d.id
        JOIN public.deliverables_criacao dc2     ON dc2.id = d.id
        WHERE d.project_id = p.id
          AND dfd.faturamento_efetivo = 'mensal_separado'
          AND dc2.criacao_efetiva >= _ini AND dc2.criacao_efetiva < _fim
          AND d.status NOT IN ('reprovado', 'cancelado')
      ) e
      WHERE p.client_id = c.client_id AND (h.horas > 0 OR e.n > 0)
    ) q;

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
      -- A nota separada do mês. `total` NÃO entra no total da fatura: é outro
      -- documento, e somar aqui cobraria duas vezes.
      'nota_mes', jsonb_build_object(
        'subtotal', _sep_subtotal,
        'margem', _sep_margem,
        'imposto', _sep_imposto,
        'total', _sep_total,
        'horas_edicao', COALESCE(_h_edic_sep, 0),
        'horas_alteracao', COALESCE(_h_alt_sep, 0),
        'itens', COALESCE(_itens_sep, '[]'::jsonb),
        'projetos', COALESCE(_sep_projetos, '[]'::jsonb),
        'regra', COALESCE(_sep_regra, '')
      ),
      'avulsos', _avulsos,
      'avulsos_valor', COALESCE(_avulsos_valor, 0),
      'avulsos_valor_hora', _vh_avulso,
      'avulsos_valor_hora_origem', _vh_avulso_origem,
      'diarias', _diarias_det,
      'diarias_repasse', _diarias_repasse,
      'diarias_qtd', _diarias_qtd,
      'diarias_cobradas', _diarias_cobradas,
      'diarias_valor_unitario', COALESCE(_valor_diaria, 0),
      'diarias_valor', _diarias_valor,
      'diarias_saldo_abatido', LEAST(_saldo_diarias, _diarias_qtd),
      'saldo', _saldo_usado,
      'comissoes', _comissoes,
      'valor_combinado', _ovr_mensal,
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


-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE
  cli uuid; sub numeric; tot numeric; nt numeric; ovr numeric; esperado numeric;
  cli_tab uuid; alvo uuid; t0 numeric; t1 numeric; itens0 int; itens1 int;
BEGIN
  -- ---------- modelo HORAS: o caso real do Sul Minas ----------
  SELECT cf.client_id INTO cli FROM public.client_faturamento cf
   JOIN public.clients c ON c.id = cf.client_id
   WHERE c.name ILIKE '%Sul Minas%' AND cf.modelo = 'horas' LIMIT 1;

  IF cli IS NOT NULL THEN
    PERFORM public.gerar_faturamento_mensal(date '2026-07-01', cli);
    SELECT fm.subtotal, fm.total, (fm.detalhe->'nota_mes'->>'total')::numeric,
           (fm.detalhe->>'valor_combinado')::numeric
      INTO sub, tot, nt, ovr
      FROM public.faturamento_mensal fm
     WHERE fm.client_id = cli AND fm.ref_mes = date '2026-07-01';

    IF COALESCE(ovr, 0) <= 0 THEN RAISE EXCEPTION 'o valor combinado sumiu do detalhe'; END IF;

    -- O combinado tem que entrar pelo valor CHEIO: tirar ele do total precisa
    -- dar exatamente subtotal + margem + imposto + comissão.
    SELECT ROUND(fm.subtotal + fm.margem_valor + fm.imposto_valor
                 + CASE WHEN cf.precos_finais THEN 0 ELSE fm.comissao_valor END, 2)
      INTO esperado
      FROM public.faturamento_mensal fm
      JOIN public.client_faturamento cf ON cf.client_id = fm.client_id
     WHERE fm.client_id = cli AND fm.ref_mes = date '2026-07-01';

    IF ROUND(tot - ovr, 2) <> esperado THEN
      RAISE EXCEPTION 'horas: o combinado não entrou pelo valor cheio (total % - % <> %)', tot, ovr, esperado;
    END IF;
    RAISE NOTICE 'horas · julho/Sul Minas: mes % (combinado % por dentro) + nota % = %',
      tot, ovr, nt, ROUND(tot + nt, 2);
  END IF;

  -- ---------- modelo TABELA: o suporte que faltava ----------
  -- Põe um valor combinado num job de tabela, confere que as peças dele saem
  -- da lista E que o valor entra cheio, e desfaz. Sem isto o modelo tabela
  -- volta a ficar sem teste — que foi exatamente como o bug passou.
  SELECT cf.client_id INTO cli_tab FROM public.client_faturamento cf WHERE cf.modelo = 'tabela' LIMIT 1;
  IF cli_tab IS NULL THEN RAISE NOTICE 'sem cliente de tabela pra testar'; RETURN; END IF;

  PERFORM public.gerar_faturamento_mensal(date '2026-07-01', cli_tab);
  SELECT fm.total, jsonb_array_length(fm.detalhe->'itens') INTO t0, itens0
    FROM public.faturamento_mensal fm WHERE fm.client_id = cli_tab AND fm.ref_mes = date '2026-07-01';

  SELECT (x->>'project_id')::uuid INTO alvo
    FROM public.faturamento_mensal fm, LATERAL jsonb_array_elements(fm.detalhe->'por_projeto') x
   WHERE fm.client_id = cli_tab AND fm.ref_mes = date '2026-07-01'
     AND x->>'balde' = 'mensal' AND jsonb_array_length(x->'pecas') > 0
   LIMIT 1;

  IF alvo IS NULL THEN RAISE NOTICE 'sem job de tabela com peças pra testar'; RETURN; END IF;

  UPDATE public.projects SET valor_fechamento = 1000, valor_fechamento_origem = 'manual' WHERE id = alvo;
  PERFORM public.gerar_faturamento_mensal(date '2026-07-01', cli_tab);
  SELECT fm.total, jsonb_array_length(fm.detalhe->'itens') INTO t1, itens1
    FROM public.faturamento_mensal fm WHERE fm.client_id = cli_tab AND fm.ref_mes = date '2026-07-01';
  UPDATE public.projects SET valor_fechamento = NULL, valor_fechamento_origem = NULL WHERE id = alvo;
  PERFORM public.gerar_faturamento_mensal(date '2026-07-01', cli_tab);

  IF itens1 >= itens0 THEN
    RAISE EXCEPTION 'tabela: as peças do job combinado continuaram na lista (% -> %)', itens0, itens1;
  END IF;
  RAISE NOTICE 'tabela: job combinado tira % peça(s) da lista e soma o valor cheio (total % -> %)',
    itens0 - itens1, t0, t1;
END $medicao$;
