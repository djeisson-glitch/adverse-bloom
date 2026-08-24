-- =========================================================================
-- Lançamentos: o livro-caixa próprio, feito pra produtora
--
-- Djêisson (23/08/2026): "precisamos ter um lugar onde podemos preencher
-- manualmente e fazer os lançamentos manualmente, assim como no conta azul, só
-- que claro, otimizado para produtora."
--
-- O `conta_azul_cache` é espelho: chega pronto, não se edita, e some se o sync
-- parar. Serve pra conferir, não pra ser verdade. Daqui em diante a verdade
-- mora aqui.
--
-- ------------------------------------------------- o que faz ser "de produtora"
--
-- 1. `project_id` no lançamento. É o que faz margem por projeto sair de graça,
--    sem ninguém ratear nada no fim do mês. Num ERP genérico o custo mora numa
--    categoria e o projeto é um campo de texto, quando existe.
--
-- 2. As DUAS dimensões de classificação, não uma:
--      comportamento — fixo · variavel · discricionario · transacao
--      natureza      — receita · despesa · investimento · amortizacao ·
--                      destinacao · imposto · financeiro · ajuste
--    Colapsar as duas foi o que produziu número errado por anos. "Fixo ou
--    variável" responde quanto preciso vender; "despesa ou não" responde se
--    aquilo é custo. Um empréstimo é fixo E não é despesa.
--
-- 3. `funcao` — quando o lançamento é cachê, guarda de qual função. É o que
--    liga o custo real à tabela de cachês e deixa comparar orçado × pago.
--
-- 4. Parcelamento nativo (`grupo_parcela`), porque equipamento e dívida vivem
--    parcelados e o mês em que a última parcela cai muda o ponto de equilíbrio.
--
-- ---------------------------------------------------------------- o que NÃO faz
--
-- Não emite nota, não gera boleto, não concilia banco. Isso continua no Conta
-- Azul (ou em quem o substituir). Aqui é a camada de decisão.
-- =========================================================================

-- --------------------------------------------------------- plano de contas
CREATE TABLE IF NOT EXISTS public.categorias_financeiras (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text NOT NULL UNIQUE,
  tipo           text NOT NULL CHECK (tipo IN ('entrada','saida')),
  comportamento  text NOT NULL CHECK (comportamento IN ('fixo','variavel','discricionario','transacao')),
  natureza       text NOT NULL CHECK (natureza IN ('receita','despesa','investimento','amortizacao','destinacao','imposto','financeiro','ajuste')),
  ativa          boolean NOT NULL DEFAULT true,
  ordem          int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.categorias_financeiras.natureza IS
  'receita/despesa entram no resultado. investimento vira ativo, amortizacao '
  'quita dívida, destinacao é lucro distribuído, ajuste é estorno — nenhum '
  'desses quatro é resultado, embora todos mexam no caixa.';

ALTER TABLE public.categorias_financeiras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categorias leitura" ON public.categorias_financeiras;
CREATE POLICY "categorias leitura" ON public.categorias_financeiras
  FOR SELECT TO authenticated USING (public.pode_ver_dinheiro());
DROP POLICY IF EXISTS "categorias escrita" ON public.categorias_financeiras;
CREATE POLICY "categorias escrita" ON public.categorias_financeiras
  FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro()) WITH CHECK (public.pode_ver_dinheiro());

-- --------------------------------------------------------------- o livro
CREATE TABLE IF NOT EXISTS public.lancamentos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo              text NOT NULL CHECK (tipo IN ('entrada','saida')),
  descricao         text NOT NULL,
  valor             numeric(12,2) NOT NULL CHECK (valor > 0),

  data_competencia  date NOT NULL,
  data_vencimento   date NOT NULL,
  data_pagamento    date,

  categoria_id      uuid NOT NULL REFERENCES public.categorias_financeiras(id),
  client_id         uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id        uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  contraparte       text,
  funcao            text,
  conta             text,

  grupo_parcela     uuid,
  parcela_num       int,
  parcela_total     int,

  origem            text NOT NULL DEFAULT 'manual'
                    CHECK (origem IN ('manual','conta_azul','recorrente','faturamento')),
  ref_externa       text,
  observacao        text,

  criado_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT parcela_coerente CHECK (
    (grupo_parcela IS NULL AND parcela_num IS NULL AND parcela_total IS NULL)
    OR (grupo_parcela IS NOT NULL AND parcela_num BETWEEN 1 AND parcela_total)
  ),
  CONSTRAINT pagamento_nao_precede_competencia CHECK (
    data_pagamento IS NULL OR data_pagamento >= data_competencia - 365
  )
);

COMMENT ON COLUMN public.lancamentos.data_pagamento IS
  'NULL = em aberto. É a única coluna que separa a visão de caixa da visão de '
  'resultado: competência diz quando aconteceu, pagamento diz quando o dinheiro '
  'andou. Em produtora essas duas datas divergem muito.';
COMMENT ON COLUMN public.lancamentos.project_id IS
  'Preencher sempre que o lançamento pertencer a um projeto. É o que faz a '
  'margem por projeto existir sem rateio manual no fim do mês.';
COMMENT ON COLUMN public.lancamentos.ref_externa IS
  'Id no sistema de origem (ex.: id do Conta Azul), pra importar sem duplicar.';

CREATE INDEX IF NOT EXISTS lancamentos_competencia_idx ON public.lancamentos (data_competencia);
CREATE INDEX IF NOT EXISTS lancamentos_vencimento_idx  ON public.lancamentos (data_vencimento);
CREATE INDEX IF NOT EXISTS lancamentos_projeto_idx     ON public.lancamentos (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lancamentos_grupo_idx       ON public.lancamentos (grupo_parcela) WHERE grupo_parcela IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_ref_externa_idx
  ON public.lancamentos (origem, ref_externa) WHERE ref_externa IS NOT NULL;

ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lancamentos dinheiro" ON public.lancamentos;
CREATE POLICY "lancamentos dinheiro" ON public.lancamentos
  FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro()) WITH CHECK (public.pode_ver_dinheiro());

-- ------------------------------------------------------ lançar parcelado
CREATE OR REPLACE FUNCTION public.lancar_parcelado(
  _tipo text, _descricao text, _valor_total numeric, _parcelas int,
  _primeira_competencia date, _primeiro_vencimento date, _categoria_id uuid,
  _client_id uuid DEFAULT NULL, _project_id uuid DEFAULT NULL,
  _contraparte text DEFAULT NULL, _conta text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g uuid := gen_random_uuid();
  base numeric(12,2);
  resto numeric(12,2);
  i int;
  v numeric(12,2);
BEGIN
  IF NOT public.pode_ver_dinheiro() THEN
    RAISE EXCEPTION 'sem permissão para lançar';
  END IF;
  IF _parcelas < 1 THEN
    RAISE EXCEPTION 'parcelas tem que ser pelo menos 1';
  END IF;

  -- Divisão que não perde centavo: as parcelas são iguais e a diferença de
  -- arredondamento vai inteira na primeira. Somar as parcelas tem que dar
  -- exatamente o total — senão o fechamento do mês nunca bate.
  base  := trunc(_valor_total / _parcelas, 2);
  resto := _valor_total - (base * _parcelas);

  FOR i IN 1.._parcelas LOOP
    v := base + CASE WHEN i = 1 THEN resto ELSE 0 END;
    INSERT INTO public.lancamentos (
      tipo, descricao, valor, data_competencia, data_vencimento,
      categoria_id, client_id, project_id, contraparte, conta,
      grupo_parcela, parcela_num, parcela_total, origem, criado_por
    ) VALUES (
      _tipo,
      _descricao || CASE WHEN _parcelas > 1 THEN ' (' || i || '/' || _parcelas || ')' ELSE '' END,
      v,
      (_primeira_competencia + make_interval(months => i - 1))::date,
      (_primeiro_vencimento  + make_interval(months => i - 1))::date,
      _categoria_id, _client_id, _project_id, _contraparte, _conta,
      CASE WHEN _parcelas > 1 THEN g END,
      CASE WHEN _parcelas > 1 THEN i END,
      CASE WHEN _parcelas > 1 THEN _parcelas END,
      'manual', auth.uid()
    );
  END LOOP;

  RETURN g;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lancar_parcelado(text,text,numeric,int,date,date,uuid,uuid,uuid,text,text) TO authenticated;

-- --------------------------------------------------- as três visões do mês
CREATE OR REPLACE FUNCTION public.resultado_mes(_mes date)
RETURNS TABLE (
  mes date, receita numeric, despesa numeric, resultado numeric,
  investimento numeric, amortizacao numeric, destinacao numeric,
  entrou numeric, saiu numeric, caixa numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH g AS (SELECT public.pode_ver_dinheiro() AS ok),
  p AS (SELECT date_trunc('month', _mes)::date AS ini,
               (date_trunc('month', _mes) + interval '1 month - 1 day')::date AS fim),
  -- competência: o que aconteceu no mês, tenha o dinheiro andado ou não
  comp AS (
    SELECT c.natureza, SUM(l.valor) AS v
      FROM public.lancamentos l
      JOIN public.categorias_financeiras c ON c.id = l.categoria_id, p
     WHERE l.data_competencia BETWEEN p.ini AND p.fim
     GROUP BY c.natureza
  ),
  -- caixa: o que de fato entrou e saiu, pela data de pagamento
  cx AS (
    SELECT l.tipo, SUM(l.valor) AS v
      FROM public.lancamentos l, p
     WHERE l.data_pagamento BETWEEN p.ini AND p.fim
     GROUP BY l.tipo
  )
  SELECT p.ini,
    COALESCE((SELECT v FROM comp WHERE natureza='receita'),0),
    COALESCE((SELECT v FROM comp WHERE natureza='despesa'),0)
      + COALESCE((SELECT v FROM comp WHERE natureza='imposto'),0),
    COALESCE((SELECT v FROM comp WHERE natureza='receita'),0)
      - COALESCE((SELECT v FROM comp WHERE natureza='despesa'),0)
      - COALESCE((SELECT v FROM comp WHERE natureza='imposto'),0),
    COALESCE((SELECT v FROM comp WHERE natureza='investimento'),0),
    COALESCE((SELECT v FROM comp WHERE natureza='amortizacao'),0),
    COALESCE((SELECT v FROM comp WHERE natureza='destinacao'),0),
    COALESCE((SELECT v FROM cx WHERE tipo='entrada'),0),
    COALESCE((SELECT v FROM cx WHERE tipo='saida'),0),
    COALESCE((SELECT v FROM cx WHERE tipo='entrada'),0) - COALESCE((SELECT v FROM cx WHERE tipo='saida'),0)
  FROM p, g WHERE g.ok;
$$;

COMMENT ON FUNCTION public.resultado_mes(date) IS
  'As três visões do mesmo mês: resultado (competência, só receita e despesa), '
  'os movimentos que não são resultado (investimento, amortização, destinação) '
  'e o caixa (pela data de pagamento). Um mês pode dar lucro e queimar caixa — '
  'foi o que aconteceu em 2025/26 e nenhuma tela mostrava.';

GRANT EXECUTE ON FUNCTION public.resultado_mes(date) TO authenticated;
-- ========================= plano de contas semeado
-- As 61 categorias são as REAIS do Conta Azul (51 de saída medidas em 24 meses
-- de lançamento + 10 de entrada), já classificadas nas duas dimensões. Começar
-- com o plano de contas dele evita a pior parte de migrar: recategorizar tudo.
INSERT INTO public.categorias_financeiras (nome, tipo, comportamento, natureza) VALUES
    ('4.11 Outras Despesas', 'saida', 'fixo', 'despesa'),
    ('Alimentação', 'saida', 'variavel', 'despesa'),
    ('Aluguel', 'saida', 'fixo', 'despesa'),
    ('Aluguel de carro', 'saida', 'fixo', 'despesa'),
    ('Atores', 'saida', 'variavel', 'despesa'),
    ('Colaboradores - fixo', 'saida', 'fixo', 'despesa'),
    ('Combustíveis / Estacionamento', 'saida', 'variavel', 'despesa'),
    ('Comissões de agência', 'saida', 'variavel', 'despesa'),
    ('Compra de equipamentos', 'saida', 'fixo', 'investimento'),
    ('Confraternizações', 'saida', 'discricionario', 'despesa'),
    ('Copa e Cozinha', 'saida', 'fixo', 'despesa'),
    ('Cursos de edição / direção', 'saida', 'discricionario', 'despesa'),
    ('Despesas a identificar', 'saida', 'fixo', 'despesa'),
    ('Despesas com Viagens dos sócios', 'saida', 'discricionario', 'despesa'),
    ('Distribuição de Lucros', 'saida', 'fixo', 'destinacao'),
    ('Drone', 'saida', 'variavel', 'despesa'),
    ('Editor / Assistente - Variável', 'saida', 'variavel', 'despesa'),
    ('Editores - fixo', 'saida', 'fixo', 'despesa'),
    ('Empréstimos de Bancos', 'saida', 'fixo', 'amortizacao'),
    ('Financeiro / BPO', 'saida', 'fixo', 'despesa'),
    ('Freela - Edição', 'saida', 'variavel', 'despesa'),
    ('Freela - Operador de câmeras', 'saida', 'variavel', 'despesa'),
    ('Gestão de projetos & Produtor - Fixo', 'saida', 'fixo', 'despesa'),
    ('Honorários (outros)', 'saida', 'fixo', 'despesa'),
    ('Honorários Contábeis', 'saida', 'fixo', 'despesa'),
    ('Hospedagens', 'saida', 'variavel', 'despesa'),
    ('INSS sobre Pró-labore - GPS', 'saida', 'fixo', 'despesa'),
    ('Juros pagos', 'saida', 'fixo', 'despesa'),
    ('Locutor', 'saida', 'variavel', 'despesa'),
    ('Marketing e Publicidade', 'saida', 'discricionario', 'despesa'),
    ('Materiais de Escritório', 'saida', 'fixo', 'despesa'),
    ('Multas pagas', 'saida', 'discricionario', 'despesa'),
    ('Outras comissões', 'saida', 'variavel', 'despesa'),
    ('Outras taxas administrativas', 'saida', 'fixo', 'despesa'),
    ('Passagem aérea', 'saida', 'variavel', 'despesa'),
    ('Pedágios', 'saida', 'variavel', 'despesa'),
    ('Pró-labore', 'saida', 'fixo', 'despesa'),
    ('Reformas e manutenções do escritório', 'saida', 'fixo', 'despesa'),
    ('Remuneração de Estagiários', 'saida', 'fixo', 'despesa'),
    ('Simples Nacional - DAS', 'saida', 'variavel', 'imposto'),
    ('Software comercial', 'saida', 'fixo', 'despesa'),
    ('Softwares operacionais', 'saida', 'fixo', 'despesa'),
    ('Tarifa de boleto', 'saida', 'transacao', 'despesa'),
    ('Tarifas', 'saida', 'transacao', 'despesa'),
    ('Tarifas Bancárias', 'saida', 'fixo', 'despesa'),
    ('Tarifas DOC / TED', 'saida', 'transacao', 'despesa'),
    ('Tarifas de Cartões de Crédito', 'saida', 'transacao', 'despesa'),
    ('Telefonia e Internet', 'saida', 'fixo', 'despesa'),
    ('Transporte Urbano (táxi, Uber)', 'saida', 'variavel', 'despesa'),
    ('Treinamentos', 'saida', 'discricionario', 'despesa'),
    ('Verba de produção', 'saida', 'variavel', 'despesa'),
    ('Produção de conteúdo', 'entrada', 'variavel', 'receita'),
    ('Receitas de Serviços', 'entrada', 'variavel', 'receita'),
    ('Produção de comerciais', 'entrada', 'variavel', 'receita'),
    ('Produção de institucionais', 'entrada', 'variavel', 'receita'),
    ('Podcast', 'entrada', 'variavel', 'receita'),
    ('Eventos', 'entrada', 'variavel', 'receita'),
    ('Clipes musicais', 'entrada', 'variavel', 'receita'),
    ('Empréstimos de Bancos (captação)', 'entrada', 'transacao', 'financeiro'),
    ('Estorno', 'entrada', 'transacao', 'ajuste'),
    ('Outras entradas não operacionais', 'entrada', 'transacao', 'ajuste')ON CONFLICT (nome) DO NOTHING;
