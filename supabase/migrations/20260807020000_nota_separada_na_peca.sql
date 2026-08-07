-- =========================================================================
-- Faturar à parte também no nível da PEÇA
--
-- Pedido do Djêisson (07/08/2026): "às vezes o cliente pede pra fazermos uma
-- nota separada pra um serviço. tem como separar o projeto/entregável dos
-- demais pra sabermos o valor das horas?"
--
-- Metade disso já existia: `projects.faturamento = 'avulso'` (20260719190000)
-- tira o projeto inteiro de tudo que o fechamento soma e o joga num bloco
-- "faturar à parte". O que faltava:
--
--   1. O nível da PEÇA. Quando só UM entregável de um projeto mensal vai pra
--      nota separada, hoje não há como dizer isso — ou sai o projeto todo, ou
--      não sai nada.
--   2. O VALOR. O bloco mostra horas e entregas e nenhum dinheiro, então
--      avisa que tem coisa pra cobrar sem dizer quanto. (Vem na migration
--      seguinte, que reconstrói a função.)
--
-- POR QUE UMA VIEW e não repetir o COALESCE em cada consulta:
--
-- A função de fechamento filtra `p.faturamento = 'mensal'` em NOVE lugares
-- (horas, horas por projeto, alterações, itens da tabela, diárias usadas,
-- entregas usadas, e as duas contagens da janela do contrato). Se a regra
-- efetiva ficar escrita nove vezes, basta uma delas ficar pra trás pra as
-- horas caírem num balde e as peças no outro — que é exatamente o defeito
-- que já custou duas auditorias aqui. A regra passa a existir num lugar só,
-- do mesmo jeito que `deliverables_criacao` fez com a data.
--
-- A PEÇA VENCE O PROJETO, nos dois sentidos: uma peça marcada 'mensal' dentro
-- de um projeto avulso volta pro fechamento. É o caso simétrico e sai de
-- graça no COALESCE — cobrar meio projeto no mês e meio à parte é uma
-- combinação que o cliente faz, não uma que o sistema precisa proibir.
-- =========================================================================

ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS faturamento text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deliverables_faturamento_ck') THEN
    ALTER TABLE public.deliverables
      ADD CONSTRAINT deliverables_faturamento_ck CHECK (faturamento IN ('mensal', 'avulso'));
  END IF;
END $$;

COMMENT ON COLUMN public.deliverables.faturamento IS
  'Como ESTA peça é faturada. NULL = segue o projeto (o normal). ''avulso'' '
  'tira a peça do fechamento mensal pra nota separada; ''mensal'' traz de '
  'volta uma peça de projeto avulso. Ver view deliverables_faturamento.';

/**
 * Balde de faturamento resolvido por peça — fonte única.
 *
 * Nenhuma tela e nenhuma função deve repetir esta cascata; quem precisa
 * saber se a peça entra no fechamento do mês pergunta aqui.
 */
CREATE OR REPLACE VIEW public.deliverables_faturamento
WITH (security_invoker = on) AS
SELECT
  d.id,
  d.project_id,
  p.client_id,
  -- 'mensal' no fim cobre a peça órfã (projeto apagado). Sem ele o NULL
  -- sumiria com a peça de TODOS os cortes, calado — e peça que some do
  -- fechamento é dinheiro que não é cobrado.
  coalesce(d.faturamento, p.faturamento, 'mensal') AS faturamento_efetivo,
  (d.faturamento IS NOT NULL)                      AS decidido_na_peca,
  coalesce(p.faturamento, 'mensal')                AS faturamento_projeto
FROM public.deliverables d
LEFT JOIN public.projects p ON p.id = d.project_id;

COMMENT ON VIEW public.deliverables_faturamento IS
  'Faturamento efetivo por peça: a decisão da peça vence a do projeto. '
  'faturamento_efetivo = mensal entra no fechamento do mês; avulso sai pra '
  'nota separada. Fonte única — não repita o COALESCE em consulta nenhuma.';

GRANT SELECT ON public.deliverables_faturamento TO authenticated;

-- ---------------------------------------------------------------- medição
DO $$
DECLARE total int; herda int; propria int; fora int;
BEGIN
  SELECT count(*) INTO total   FROM public.deliverables_faturamento;
  SELECT count(*) INTO herda   FROM public.deliverables_faturamento WHERE NOT decidido_na_peca;
  SELECT count(*) INTO propria FROM public.deliverables_faturamento WHERE decidido_na_peca;
  SELECT count(*) INTO fora    FROM public.deliverables_faturamento WHERE faturamento_efetivo = 'avulso';

  -- A coluna nasce vazia: TODAS as peças têm que estar herdando o projeto, e
  -- o total de peças fora do fechamento tem que ser exatamente o que já
  -- estava fora antes desta migration. Se divergir, a view mudou o passado
  -- de alguém — e isso é fatura errada, não detalhe.
  IF propria <> 0 THEN
    RAISE EXCEPTION 'coluna nova já veio com % peças decididas na peça — deveria nascer vazia', propria;
  END IF;
  IF fora <> (SELECT count(*) FROM public.deliverables d
               JOIN public.projects p ON p.id = d.project_id
              WHERE p.faturamento = 'avulso') THEN
    RAISE EXCEPTION 'a view mudou quais peças estão fora do fechamento';
  END IF;

  RAISE NOTICE 'peças: % | herdando o projeto: % | com decisão própria: % | fora do fechamento: %',
    total, herda, propria, fora;
END $$;
