-- =========================================================================
-- O projeto pode valer o ORÇAMENTO no fechamento, não as horas
--
-- Pedido do Djêisson (07/08/2026): "no caso de um vídeo que era pra ser
-- faturado separadamente e depois foi incluso no fechamento do mês (e já
-- possui orçamento) usar o valor/horas do orçamento, pois trabalhamos ele de
-- uma forma mais individual."
--
-- POR QUE NO PROJETO E NÃO NA PEÇA
--
-- O orçamento é do JOB. Um projeto com três peças tem UM valor vendido; se o
-- override morasse na peça, aplicar "o valor do orçamento" nas três cobraria
-- três vezes o mesmo acordo. No projeto, a conta é uma só: este job vale X
-- neste fechamento, independente de quantas peças e quantas horas deu.
--
-- NÃO É AUTOMÁTICO, de propósito. O sistema mostra o valor do orçamento a um
-- clique e registra que foi ele que valeu (`valor_fechamento_origem`), mas
-- não troca o preço sozinho quando alguém vincula um orçamento — preço de
-- cliente mudando por efeito colateral de outra ação é como se perde a
-- confiança no número.
--
-- O QUE O OVERRIDE SUBSTITUI
--
--   modelo horas    as horas daquele projeto × valor-hora
--   modelo tabela   a soma dos preços das peças daquele projeto
--
-- Em ambos ele vale DENTRO do balde do projeto: um job em nota separada com
-- override entra na nota separada pelo valor do override, não no fechamento.
--
-- ---------------------------------------------------------------------
-- E O PAINEL: `por_projeto` vira o lugar de ver e decidir
--
-- "precisaria ter algum lugar pra ver o valor de cada entrega e um botão
-- simples pra clicar em faturar separado, seria mais fácil que dentro da
-- tarefa/projeto."
--
-- Hoje `por_projeto` só lista quem está no balde 'mensal' — então marcar um
-- projeto como nota separada o fazia SUMIR da lista, e o botão sumiria junto
-- com ele. Passa a listar todos os baldes, com o balde de cada um, o valor,
-- o orçamento vinculado e as peças (cada uma com as suas horas e o SEU
-- balde efetivo).
--
-- Esse último ponto é o que teria evitado o problema de hoje: os projetos
-- 0020 e 0203 do Sul Minas estavam marcados como nota separada, mas as peças
-- dentro deles tinham 'mensal' gravado na peça — que vence o projeto, pela
-- regra. A nota saiu R$ 0,00 e não havia tela nenhuma onde isso aparecesse.
-- =========================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS valor_fechamento numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_fechamento_origem text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_valor_fechamento_origem_ck') THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_valor_fechamento_origem_ck
      CHECK (valor_fechamento_origem IN ('orcamento', 'manual'));
  END IF;
END $$;

COMMENT ON COLUMN public.projects.valor_fechamento IS
  'Quanto ESTE projeto vale no fechamento do mês, no lugar do cálculo normal '
  '(horas × valor-hora, ou soma dos preços das peças). NULL = calcula. '
  'Vale dentro do balde do projeto — ver deliverables_faturamento.';
COMMENT ON COLUMN public.projects.valor_fechamento_origem IS
  'De onde veio o valor: ''orcamento'' (o vendido no orçamento do job) ou '
  '''manual'' (digitado no fechamento). Fica registrado pra ninguém precisar '
  'lembrar por que aquele projeto não saiu pelas horas.';

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE alvo uuid; recusou boolean;
BEGIN
  SELECT id INTO alvo FROM public.projects LIMIT 1;
  IF alvo IS NULL THEN RAISE NOTICE 'sem projetos pra testar'; RETURN; END IF;

  UPDATE public.projects SET valor_fechamento = 1234.56, valor_fechamento_origem = 'orcamento' WHERE id = alvo;
  IF (SELECT valor_fechamento FROM public.projects WHERE id = alvo) <> 1234.56 THEN
    RAISE EXCEPTION 'não gravou o valor de fechamento';
  END IF;

  recusou := false;
  BEGIN
    UPDATE public.projects SET valor_fechamento_origem = 'chutado' WHERE id = alvo;
  EXCEPTION WHEN check_violation THEN recusou := true;
  END;
  IF NOT recusou THEN RAISE EXCEPTION 'o CHECK aceitou uma origem inválida'; END IF;

  UPDATE public.projects SET valor_fechamento = NULL, valor_fechamento_origem = NULL WHERE id = alvo;
  IF (SELECT valor_fechamento FROM public.projects WHERE id = alvo) IS NOT NULL THEN
    RAISE EXCEPTION 'o projeto de teste não voltou ao normal';
  END IF;

  RAISE NOTICE 'override de valor grava, recusa origem inválida e limpa';
END $medicao$;
