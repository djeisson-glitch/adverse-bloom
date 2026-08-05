-- =========================================================================
-- O mês trava na data do PROJETO
--
-- Decisão do Djêisson (05/08/2026), depois de ver o quadro medido:
--
--   — "mas a data de corte pra faturamento continua usando a data do
--      projeto, correto?"
--   — Não: passou a ser a da peça, com piso no projeto.
--   — "prefiro travar no projeto."
--
-- Então: um job tem UM mês, e todas as peças dele são desse mês. Não importa
-- se a peça foi cadastrada três dias depois — ela é do job, e o job tem data.
--
-- A data da PEÇA continua existindo, editável e visível: ela responde "quando
-- ESTA peça entrou", que é informação de produção. Só deixa de mexer no mês
-- do fechamento — e é isso que a torna segura de ajustar.
--
-- A regra de "só pra frente" (20260806010000) segue valendo pelo mesmo
-- motivo de sempre: peça anterior ao job é engano de digitação. Ela só não
-- decide mais dinheiro.
--
-- EFEITO MEDIDO antes de aplicar: de 358 peças, exatamente 2 trocam de mês —
-- as duas do Sicredi Sul Minas, de junho pra julho:
--
--   #20263006_TESTEIRA_ACESSO_ASSOCIADO_SICREDI     jun → jul
--   #20261006_EXPERIENCIA_DO_ASSOCIADO_SICREDI      jun → jul
--
-- Nos dois o projeto está com a data da IMPORTAÇÃO do ClickUp (julho) e a
-- peça tinha o ajuste manual correto (30/06). Travando no projeto, o ajuste
-- da peça para de valer e elas voltam pra julho. O conserto certo é ajustar
-- a data DESSES PROJETOS pra junho — e aí as peças acompanham sozinhas
-- (trigger trg_projeto_data_desce). Fica anotado aqui e reportado na
-- conversa; não faço à mão porque é decisão de negócio sobre mês de fatura.
-- =========================================================================

CREATE OR REPLACE VIEW public.deliverables_criacao
WITH (security_invoker = on) AS
SELECT
  d.id,
  d.project_id,
  coalesce(d.criado_em, d.created_at)                                   AS criacao_peca,
  -- Travada no PROJETO. A cascata pra peça só existe pro caso de peça órfã
  -- (LEFT JOIN sem projeto), que não deveria acontecer — mas NULL aqui
  -- sumiria com a peça de todo corte mensal, calado.
  coalesce(p.criado_em, p.created_at, d.criado_em, d.created_at)        AS criacao_efetiva,
  (d.criado_em IS NOT NULL)                                             AS peca_ajustada,
  (p.criado_em IS NOT NULL)                                             AS projeto_ajustado
FROM public.deliverables d
LEFT JOIN public.projects p ON p.id = d.project_id;

COMMENT ON VIEW public.deliverables_criacao IS
  'Data de criação resolvida por peça. criacao_efetiva é a base pro corte '
  'mensal e vale a data do PROJETO — um job tem um mês só. criacao_peca é '
  'quando aquela peça específica entrou (informação de produção, não muda '
  'mês). Fonte única — nenhuma tela deve repetir esta cascata.';

-- ---------------------------------------------------------------- medição
DO $$
DECLARE difere int;
BEGIN
  -- Peça cuja data própria cai em mês diferente do projeto. Agora isso é só
  -- informação — mas se o número crescer muito, é sinal de que a regra
  -- travada está incomodando na prática, e vale rever.
  SELECT count(*) INTO difere
    FROM public.deliverables d
    JOIN public.projects p ON p.id = d.project_id
   WHERE d.criado_em IS NOT NULL
     AND date_trunc('month', d.criado_em)
         <> date_trunc('month', coalesce(p.criado_em, p.created_at));
  RAISE NOTICE 'peças cuja data própria cai em outro mês que a do projeto (só informativo agora): %', difere;
END $$;
