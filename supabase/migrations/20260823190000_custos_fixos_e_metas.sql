-- =========================================================================
-- Custo fixo com VIGÊNCIA e meta de faturamento olhando pra frente
--
-- Djêisson (23/08/2026): "esses números sempre foram uma nuvem escura pairando
-- sobre a Adverse, e a partir de agora precisam estar extremamente claras."
--
-- O ponto de equilíbrio já existia — `calcPontoEquilibrio` em lib/financial.ts.
-- O problema nunca foi a fórmula, foi de onde vinha o custo fixo: uma lista
-- HARDCODED de nomes de categoria do Conta Azul (FIXED_COSTS), somando o que
-- já foi PAGO num período. Três consequências:
--
--   1. É retrovisor. Diz qual FOI o equilíbrio no mês passado, nunca quanto
--      preciso vender no mês que vem.
--   2. Não sabe que parcela acaba. As parcelas de equipamento e carro custam
--      R$ 9.948 em out/26 e R$ 1.759 em abr/27, zerando em jul/27 — quase
--      R$ 8.000/mês que somem sozinhos. Um retrovisor projeta out/26 pra
--      sempre e pede um corte que não é necessário.
--   3. Trata "Distribuição de Lucros" como custo fixo. Isso mistura política
--      de remuneração com estrutura: quando os sócios tiravam R$ 16.758 fixos
--      por mês, o equilíbrio embutia essa escolha e ninguém enxergava que era
--      uma escolha.
--
-- ------------------------------------------------------------- o que muda
-- O custo fixo vira DADO, com vigência e natureza. A partir daí o equilíbrio
-- é calculado para QUALQUER mês, inclusive futuro, e cai sozinho no mês em que
-- a última parcela vence. Nenhuma linha de código precisa mudar pra isso.
--
-- `natureza` separa o que a hardcoded list confundia:
--   estrutura → software, contabilidade, telefonia, tarifas (o chão)
--   pessoa    → fixo de quem trabalha aqui
--   divida    → empréstimo (não gera receita, mas é obrigação)
--   parcela   → equipamento e carro (tem fim, e o fim importa)
--   imposto   → DAS parcelado (dívida tributária, não imposto corrente)
--   retirada  → pró-labore do sócio: entra no break-even, NÃO no piso
--
-- A separação piso × break-even é o que faltava pra decisão: o PISO é o que a
-- empresa precisa faturar pra se pagar sem remunerar o dono; o BREAK-EVEN é o
-- piso mais a retirada. Entre os dois existe um mês em que a operação se banca
-- mas o pró-labore sai do caixa — e isso precisa ter nome pra ser visto.
--
-- Imposto CORRENTE e variável de produção não entram como valor: entram como
-- percentual da receita, em parametros_financeiros, porque é isso que são.
-- Somá-los como valor fixo é o erro clássico que infla o equilíbrio.
-- =========================================================================

-- ---------------------------------------------------------------- custos
CREATE TABLE IF NOT EXISTS public.custos_fixos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text NOT NULL,
  natureza         text NOT NULL
    CHECK (natureza IN ('estrutura','pessoa','divida','parcela','imposto','retirada')),
  valor_mensal     numeric(12,2) NOT NULL CHECK (valor_mensal >= 0),
  vigencia_inicio  date NOT NULL,
  vigencia_fim     date,
  categoria_ca     text,
  observacao       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vigencia_coerente CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

COMMENT ON COLUMN public.custos_fixos.vigencia_fim IS
  'NULL = sem fim previsto. Preencher é o que faz o break-even cair sozinho '
  'quando a parcela acaba — sem isso o sistema projeta o pico pra sempre.';
COMMENT ON COLUMN public.custos_fixos.categoria_ca IS
  'Categoria correspondente no Conta Azul, para conciliar previsto x realizado.';

CREATE INDEX IF NOT EXISTS custos_fixos_vigencia_idx
  ON public.custos_fixos (vigencia_inicio, vigencia_fim);

ALTER TABLE public.custos_fixos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "custos fixos dinheiro" ON public.custos_fixos;
CREATE POLICY "custos fixos dinheiro" ON public.custos_fixos
  FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro())
  WITH CHECK (public.pode_ver_dinheiro());

-- ------------------------------------------------------------ parâmetros
CREATE TABLE IF NOT EXISTS public.parametros_financeiros (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vigencia_inicio         date NOT NULL UNIQUE,
  imposto_pct             numeric(6,3) NOT NULL DEFAULT 12.0,
  variavel_producao_pct   numeric(6,3) NOT NULL DEFAULT 14.2,
  meta_extra              numeric(12,2) NOT NULL DEFAULT 15000,
  reserva_alvo            numeric(12,2) NOT NULL DEFAULT 50000,
  teto_mensal             numeric(12,2) NOT NULL DEFAULT 50000,
  split_cache_pct         numeric(6,3) NOT NULL DEFAULT 50.0,
  observacao              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pct_sensato CHECK (imposto_pct + variavel_producao_pct < 100)
);

COMMENT ON TABLE public.parametros_financeiros IS
  'Versionado por vigência: mudar a alíquota não reescreve o histórico. '
  'O mês de 2025 continua sendo lido com os parâmetros de 2025.';
COMMENT ON COLUMN public.parametros_financeiros.teto_mensal IS
  'Faturamento acima disso é pico: o excedente vai pra reserva no mesmo dia. '
  'jan/26 sozinho foi R$ 212.700 — mês grande financia mês pequeno.';
COMMENT ON COLUMN public.parametros_financeiros.split_cache_pct IS
  'Da sobra acima do break-even, quanto vira cachê. O resto vai pra reserva.';

ALTER TABLE public.parametros_financeiros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parametros dinheiro" ON public.parametros_financeiros;
CREATE POLICY "parametros dinheiro" ON public.parametros_financeiros
  FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro())
  WITH CHECK (public.pode_ver_dinheiro());

-- --------------------------------------------------------------- cálculo
CREATE OR REPLACE FUNCTION public.calcular_metas(_mes date)
RETURNS TABLE (
  mes               date,
  estrutura         numeric,
  pessoa            numeric,
  divida            numeric,
  parcela           numeric,
  imposto_atrasado  numeric,
  retirada          numeric,
  custo_sem_retirada numeric,
  margem_contribuicao numeric,
  piso              numeric,
  break_even        numeric,
  meta              numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- SECURITY DEFINER passa por cima da RLS de custos_fixos de propósito (a
  -- função precisa somar linhas que o chamador não lê uma a uma). Por isso a
  -- guarda tem que ser explícita aqui: sem ela, qualquer authenticated
  -- descobriria a folha pela porta dos fundos. Ver a nota das tabelas
  -- laterais de dinheiro — RLS protege LINHA, e SECURITY DEFINER a ignora.
  WITH guarda AS (SELECT public.pode_ver_dinheiro() AS ok),
  ref AS (SELECT date_trunc('month', _mes)::date AS m),
  par AS (
    SELECT p.* FROM public.parametros_financeiros p, ref
     WHERE p.vigencia_inicio <= ref.m
     ORDER BY p.vigencia_inicio DESC
     LIMIT 1
  ),
  c AS (
    SELECT cf.natureza, SUM(cf.valor_mensal) AS v
      FROM public.custos_fixos cf, ref
     WHERE cf.vigencia_inicio <= (ref.m + interval '1 month - 1 day')::date
       AND (cf.vigencia_fim IS NULL OR cf.vigencia_fim >= ref.m)
     GROUP BY cf.natureza
  ),
  s AS (
    SELECT
      COALESCE((SELECT v FROM c WHERE natureza='estrutura'),0) AS estrutura,
      COALESCE((SELECT v FROM c WHERE natureza='pessoa'   ),0) AS pessoa,
      COALESCE((SELECT v FROM c WHERE natureza='divida'   ),0) AS divida,
      COALESCE((SELECT v FROM c WHERE natureza='parcela'  ),0) AS parcela,
      COALESCE((SELECT v FROM c WHERE natureza='imposto'  ),0) AS imposto_atrasado,
      COALESCE((SELECT v FROM c WHERE natureza='retirada' ),0) AS retirada
  )
  SELECT
    ref.m,
    s.estrutura, s.pessoa, s.divida, s.parcela, s.imposto_atrasado, s.retirada,
    (s.estrutura + s.pessoa + s.divida + s.parcela + s.imposto_atrasado) AS custo_sem_retirada,
    mc.mc AS margem_contribuicao,
    CASE WHEN mc.mc > 0
      THEN (s.estrutura + s.pessoa + s.divida + s.parcela + s.imposto_atrasado) / mc.mc
      ELSE NULL END AS piso,
    CASE WHEN mc.mc > 0
      THEN (s.estrutura + s.pessoa + s.divida + s.parcela + s.imposto_atrasado + s.retirada) / mc.mc
      ELSE NULL END AS break_even,
    CASE WHEN mc.mc > 0
      THEN (s.estrutura + s.pessoa + s.divida + s.parcela + s.imposto_atrasado + s.retirada) / mc.mc
           + par.meta_extra
      ELSE NULL END AS meta
  FROM ref, s, par, guarda,
       LATERAL (SELECT 1 - (par.imposto_pct + par.variavel_producao_pct)/100 AS mc) mc
 WHERE guarda.ok;
$$;

COMMENT ON FUNCTION public.calcular_metas(date) IS
  'Piso, break-even e meta de um mês qualquer — inclusive futuro. Lê os custos '
  'vigentes naquele mês, então parcela que acaba some sozinha do cálculo.';

GRANT EXECUTE ON FUNCTION public.calcular_metas(date) TO authenticated;

-- ------------------------------------------------------- os próximos 12
DROP VIEW IF EXISTS public.metas_12m;
CREATE VIEW public.metas_12m
WITH (security_invoker = on) AS
  SELECT m.*
    FROM generate_series(
           date_trunc('month', CURRENT_DATE)::date,
           (date_trunc('month', CURRENT_DATE) + interval '11 months')::date,
           interval '1 month') AS g(mes),
         LATERAL public.calcular_metas(g.mes::date) AS m;

COMMENT ON VIEW public.metas_12m IS
  'Os próximos 12 meses já calculados. É aqui que se vê o break-even caindo '
  'conforme as parcelas de equipamento vencem.';

-- =========================================================================
-- Semente: a estrutura REAL medida nos 4.123 lançamentos do Conta Azul
-- (set/2025 a ago/2026), já sem a sala comercial, sem o pró-labore do sócio
-- e sem as assinaturas canceladas. Só entra se a tabela estiver vazia — este
-- arquivo nunca sobrescreve o que for cadastrado depois.
--
-- As parcelas vão UMA LINHA POR MÊS porque o valor muda todo mês e o fim é o
-- que interessa: R$ 9.948 em out/26 viram R$ 33 em jul/27. Representar isso
-- como "média mensal" apagaria justamente a informação que decide o plano.
-- =========================================================================
DO $seed$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.custos_fixos) THEN
    INSERT INTO public.custos_fixos (nome, natureza, valor_mensal, vigencia_inicio, vigencia_fim, categoria_ca, observacao) VALUES
      ('Softwares operacionais',   'estrutura', 1634.00, '2026-09-01', NULL, 'Softwares operacionais',  'já líquido das assinaturas canceladas (R$ 1.400)'),
      ('Contabilidade e BPO',      'estrutura',  841.00, '2026-09-01', NULL, 'Honorários Contábeis',    NULL),
      ('Tarifas bancárias e taxas','estrutura',  723.00, '2026-09-01', NULL, 'Tarifas Bancárias',       NULL),
      ('Despesas a identificar',   'estrutura',  543.00, '2026-09-01', NULL, 'Despesas a identificar',  'R$ 6.511 em 12 meses sem categoria — categorizar e zerar esta linha'),
      ('Software comercial',       'estrutura',  504.00, '2026-09-01', NULL, 'Software comercial',      NULL),
      ('Materiais de escritório',  'estrutura',  302.00, '2026-09-01', NULL, 'Materiais de Escritório', 'tende a cair sem a sala'),
      ('Telefonia e internet',     'estrutura',  267.00, '2026-09-01', NULL, 'Telefonia e Internet',    NULL),
      ('Outros honorários',        'estrutura',  167.00, '2026-09-01', NULL, 'Honorários (outros)',     NULL),

      ('Maiara — gestão e atendimento', 'pessoa', 3600.00, '2026-09-01', NULL, 'Gestão de projetos & Produtor - Fixo', 'vira fixo + cachê quando a tabela entrar'),
      ('Zé — base fixa',                'pessoa', 1000.00, '2026-09-01', NULL, 'Editores - fixo',                      'o variável dele é custo de projeto, não fixo'),
      ('Colaboradores — fixo',          'pessoa',  442.00, '2026-09-01', NULL, 'Colaboradores - fixo',                 NULL),

      ('Empréstimos bancários', 'divida', 6500.00, '2026-09-01', NULL, 'Empréstimos de Bancos',
       'SEM DATA DE FIM CONHECIDA: as parcelas futuras não estão lançadas no Conta Azul. Levantar saldo, taxa e parcelas restantes — se acabar antes de jul/27, o break-even cai R$ 8.800 a partir dali.'),

      ('DAS atrasado parcelado', 'imposto', 3200.00, '2026-09-01', '2027-08-31', 'Simples Nacional - DAS',
       'R$ 35.000 em aberto (jul a nov/26) em 12x. Ajustar quando o contador fechar o parcelamento.'),

      ('Pró-labore Djeisson (com encargo)', 'retirada', 9072.00, '2026-09-01', NULL, 'Pró-labore',
       'R$ 8.000 + 13,4% de encargo. Revisão marcada para fevereiro/27, quando as parcelas caem.'),

      ('Parcelas equipamento e carro', 'parcela', 5921.00, '2026-09-01', '2026-09-30', 'Compra de equipamentos', NULL),
      ('Parcelas equipamento e carro', 'parcela', 9948.00, '2026-10-01', '2026-10-31', 'Compra de equipamentos', 'pico'),
      ('Parcelas equipamento e carro', 'parcela', 8932.00, '2026-11-01', '2026-11-30', 'Compra de equipamentos', NULL),
      ('Parcelas equipamento e carro', 'parcela', 6457.00, '2026-12-01', '2026-12-31', 'Compra de equipamentos', NULL),
      ('Parcelas equipamento e carro', 'parcela', 5456.00, '2027-01-01', '2027-01-31', 'Compra de equipamentos', NULL),
      ('Parcelas equipamento e carro', 'parcela', 2794.00, '2027-02-01', '2027-02-28', 'Compra de equipamentos', 'a partir daqui a conta abre'),
      ('Parcelas equipamento e carro', 'parcela', 2159.00, '2027-03-01', '2027-03-31', 'Compra de equipamentos', NULL),
      ('Parcelas equipamento e carro', 'parcela', 1759.00, '2027-04-01', '2027-04-30', 'Compra de equipamentos', NULL),
      ('Parcelas equipamento e carro', 'parcela', 1759.00, '2027-05-01', '2027-05-31', 'Compra de equipamentos', NULL),
      ('Parcelas equipamento e carro', 'parcela', 1483.00, '2027-06-01', '2027-06-30', 'Compra de equipamentos', NULL),
      ('Parcelas equipamento e carro', 'parcela',   33.00, '2027-07-01', '2027-07-31', 'Compra de equipamentos', 'última');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.parametros_financeiros) THEN
    INSERT INTO public.parametros_financeiros
      (vigencia_inicio, imposto_pct, variavel_producao_pct, meta_extra, reserva_alvo, teto_mensal, split_cache_pct, observacao)
    VALUES
      ('2026-09-01', 12.0, 14.2, 15000, 50000, 50000, 50.0,
       'Alíquota efetiva confirmada pelo Djeisson. Variável de produção medido nos 12 meses: variável do Zé, verba de produção, freelas, atores e comissões = 14,2% da receita. Margem de contribuição resultante: 73,8%.');
  END IF;
END
$seed$;
