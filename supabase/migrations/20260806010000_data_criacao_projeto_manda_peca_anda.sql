-- =========================================================================
-- A data do projeto é o PISO; a peça só anda pra frente
--
-- Pedido do Djêisson (05/08/2026):
--
--   "ao ajustar a data de criação do projeto, os entregáveis copiam essa
--    data. ao ajustar a data de um entregável específico, o sistema vai
--    permitir ajustar apenas para frente, não para trás da data do projeto
--    (a não ser que o projeto seja ajustado). serve para os casos que o
--    projeto foi pedido, mas entrou mais alguma demanda depois, nos dias
--    seguintes."
--
-- Até aqui a data da peça era decorativa pro corte mensal: a do projeto
-- vencia sempre, e a da peça só valia quando o projeto não tinha ajuste. Ou
-- seja, a peça que entrou três dias depois era contada no dia do job — que
-- é certo pro caso comum e errado pro caso que ele descreve.
--
-- Agora são três regras que se sustentam juntas:
--
--   1. Ajustou o projeto → as peças copiam a data. Corrigiu o job, corrigiu
--      tudo que é do job. É reset mesmo: ajuste individual anterior se perde,
--      e é isso que faz o resultado ser previsível.
--   2. A peça pode ser empurrada PRA FRENTE, nunca pra trás do projeto. Uma
--      peça que "entrou antes do job existir" não é um caso real — é engano
--      de digitação, e engano de digitação aqui vira dinheiro no mês errado.
--   3. Pro mês vale a data da peça, já com o piso aplicado.
--
-- O PISO é `projects.criado_em` — o ajustado à mão — e NÃO o `created_at`.
-- O `created_at` de 185 projetos é a data da importação do ClickUp: um
-- carimbo automático, não uma decisão. Usá-lo de piso empurraria pra julho as
-- peças que hoje estão corretamente em junho (o #20263006_DIA_INTERNACIONAL,
-- peça ajustada pra 30/06, projeto importado em 03/07).
-- =========================================================================

-- ------------------------------------------------------------------- view
-- Mesma view, expressão nova. Nomes e tipos das colunas não mudam, então o
-- CREATE OR REPLACE passa.
CREATE OR REPLACE VIEW public.deliverables_criacao
WITH (security_invoker = on) AS
SELECT
  d.id,
  d.project_id,
  coalesce(d.criado_em, d.created_at)                                   AS criacao_peca,
  -- Data que vale pro MÊS. A peça manda quando foi ajustada à mão, mas nunca
  -- antes do piso do projeto; sem ajuste na peça, é a data do projeto.
  CASE
    WHEN p.criado_em IS NOT NULL AND d.criado_em IS NOT NULL
      THEN GREATEST(p.criado_em, d.criado_em)
    WHEN p.criado_em IS NOT NULL THEN p.criado_em
    WHEN d.criado_em IS NOT NULL THEN d.criado_em
    ELSE coalesce(p.created_at, d.created_at)
  END                                                                   AS criacao_efetiva,
  (d.criado_em IS NOT NULL)                                             AS peca_ajustada,
  (p.criado_em IS NOT NULL)                                             AS projeto_ajustado
FROM public.deliverables d
LEFT JOIN public.projects p ON p.id = d.project_id;

COMMENT ON VIEW public.deliverables_criacao IS
  'Data de criação resolvida por peça. criacao_efetiva é a base pro corte '
  'mensal: a data da peça vale, com PISO na data ajustada do projeto. '
  'criacao_peca é quando aquela peça específica entrou. Fonte única — '
  'nenhuma tela deve repetir esta cascata.';

-- ------------------------------------------------- 1. projeto → peças
/**
 * Ajustou a data do projeto: todas as peças dele passam a ter essa data.
 *
 * No banco e não na tela porque o ajuste do projeto vem de mais de um lugar
 * (ficha do projeto, correção em massa, importação) e um deles esquecer de
 * propagar é justamente o tipo de divergência que ninguém percebe até o
 * fechamento não bater.
 */
CREATE OR REPLACE FUNCTION public.tg_projeto_data_desce_pras_pecas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.criado_em IS NOT NULL AND NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
    UPDATE public.deliverables
       SET criado_em = NEW.criado_em
     WHERE project_id = NEW.id
       AND coalesce(criado_em, '-infinity'::timestamptz) IS DISTINCT FROM NEW.criado_em;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_projeto_data_desce ON public.projects;
CREATE TRIGGER trg_projeto_data_desce
  AFTER UPDATE OF criado_em ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_projeto_data_desce_pras_pecas();

-- ------------------------------------------------- 2. peça só anda pra frente
/**
 * A peça não pode nascer antes do job.
 *
 * Silenciar (empurrar pro piso sem avisar) seria pior: a pessoa digitaria uma
 * data, veria outra salva e não saberia por quê. Erro explícito, com a data
 * do piso na mensagem e o caminho de saída ("ajuste o projeto").
 *
 * Só vale contra o piso AJUSTADO. Enquanto o projeto está com a data
 * automática do ClickUp, não há decisão humana pra respeitar.
 */
CREATE OR REPLACE FUNCTION public.tg_peca_nao_anda_pra_tras()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE piso timestamptz;
BEGIN
  IF NEW.criado_em IS NULL THEN RETURN NEW; END IF;

  SELECT p.criado_em INTO piso FROM public.projects p WHERE p.id = NEW.project_id;
  IF piso IS NOT NULL AND NEW.criado_em < piso THEN
    RAISE EXCEPTION
      'A peça não pode ser anterior ao projeto (criado em %). Empurre a peça pra frente, ou ajuste a data do projeto primeiro.',
      to_char(piso, 'DD/MM/YYYY HH24:MI');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_peca_nao_anda_pra_tras ON public.deliverables;
CREATE TRIGGER trg_peca_nao_anda_pra_tras
  BEFORE INSERT OR UPDATE OF criado_em ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_peca_nao_anda_pra_tras();

-- ---------------------------------------------------------------- medição
DO $$
DECLARE
  fora int;
  proj_aj int;
  peca_aj int;
BEGIN
  -- Peça anterior ao piso do projeto: se existir, é dado que já estava torto
  -- antes da regra — o trigger só barra o próximo, não conserta o passado.
  SELECT count(*) INTO fora
    FROM public.deliverables d
    JOIN public.projects p ON p.id = d.project_id
   WHERE p.criado_em IS NOT NULL AND d.criado_em IS NOT NULL
     AND d.criado_em < p.criado_em;

  SELECT count(*) INTO proj_aj FROM public.projects     WHERE criado_em IS NOT NULL;
  SELECT count(*) INTO peca_aj FROM public.deliverables WHERE criado_em IS NOT NULL;

  RAISE NOTICE 'projetos com data ajustada: % | peças com data ajustada: % | peças ANTES do piso: %',
    proj_aj, peca_aj, fora;
END $$;
