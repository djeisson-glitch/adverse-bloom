-- =========================================================================
-- Data de criação também no entregável — e uma única regra de qual vale
--
-- O projeto já tem `criado_em` corrigível (pro retroativo do ClickUp). A peça
-- precisa do mesmo, porque nem toda peça nasce junto com o projeto: um job de
-- julho ganha uma redução em agosto, e a data de cadastro dela é agosto.
--
-- A REGRA, em um lugar só: quando as peças de um projeto têm datas
-- diferentes, quem manda pra efeito de mês é a data do PROJETO — senão um job
-- de julho apareceria espalhado em três meses de relatório só porque as peças
-- foram cadastradas ao longo do tempo. A data da peça continua existindo e
-- visível; ela responde "quando ESTA peça entrou", que é outra pergunta.
--
-- `criacao_efetiva` devolve isso resolvido, pra nenhuma tela ter que repetir
-- a cascata — e divergir dela.
-- =========================================================================

ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS criado_em timestamptz;

COMMENT ON COLUMN public.deliverables.criado_em IS
  'Quando ESTA peça entrou (editável). Vazio = usar created_at. Pra corte '
  'mensal de relatório vale a data do PROJETO — ver view deliverables_criacao.';

/**
 * Data que vale pra cada peça, já resolvida.
 *
 *  • `criacao_peca`   — quando a peça entrou: dela, senão o carimbo do sistema.
 *  • `criacao_efetiva`— o que vale pro MÊS: a do projeto manda; sem ela, a da
 *                       peça. É o que relatórios e buscas por mês devem usar.
 *
 * Duas colunas porque são duas perguntas, e misturar as duas numa só é o que
 * faz um job de julho aparecer em agosto.
 */
CREATE OR REPLACE VIEW public.deliverables_criacao
WITH (security_invoker = on) AS
SELECT
  d.id,
  d.project_id,
  coalesce(d.criado_em, d.created_at)                                   AS criacao_peca,
  coalesce(p.criado_em, d.criado_em, p.created_at, d.created_at)        AS criacao_efetiva,
  (d.criado_em IS NOT NULL)                                            AS peca_ajustada,
  (p.criado_em IS NOT NULL)                                            AS projeto_ajustado
FROM public.deliverables d
LEFT JOIN public.projects p ON p.id = d.project_id;

COMMENT ON VIEW public.deliverables_criacao IS
  'Data de criação resolvida por peça. criacao_efetiva é a base pra corte '
  'mensal (projeto manda); criacao_peca é quando aquela peça específica '
  'entrou. Fonte única — nenhuma tela deve repetir esta cascata.';
