-- =========================================================================
-- A ficha do projeto lia uma view que não tinha as colunas
--
-- Djêisson (07/08/2026): "as alterações não estão persistindo" — trocava o
-- Faturamento na ficha do projeto e o campo voltava pra "No fechamento do
-- mês".
--
-- E a gravação estava funcionando. O UPDATE ia pra `projects` e ficava lá; o
-- que não voltava era a LEITURA: a ficha lê de `projects_v`, e a view lista
-- as colunas na mão. `faturamento` nasceu em 19/07, depois da view, e
-- ninguém a acrescentou. `select("*")` na view devolvia tudo menos ela, o
-- React lia `undefined` e o seletor caía no padrão.
--
-- O sintoma "não salva" era, na verdade, "não lê" — e por isso o campo
-- parecia certo até dar F5. Pior: TRÊS projetos já estavam marcados como
-- avulso no banco e apareciam como "no fechamento do mês" na ficha. A tela
-- de Faturamento os tratava certo. Duas telas do mesmo sistema discordando
-- sobre em qual nota um projeto entra.
--
-- Não era só o faturamento. Perguntando o que mais a tabela tem e a view
-- não, apareceram CINCO:
--
--   faturamento          o bug reportado
--   criado_em            a data ajustável — a MESMA que decide o mês do
--                        fechamento. Ajustar pela ficha do projeto dava a
--                        mesma sensação de não salvar.
--   envio_cliente_id     o seletor de envio voltava pra "herdar" sempre
--   urgente              ainda não lida por tela nenhuma
--   urgencia_percentual  idem
--
-- POR QUE ISSO IA SE REPETIR
--
-- A view listava colunas na mão por um motivo que era verdadeiro em 14/07 e
-- deixou de ser: as colunas de dinheiro ainda estavam em `projects`, e um
-- `p.*` colidiria com as mesmas colunas vindas de `projects_financeiro`.
-- Elas já saíram — medido: ZERO nomes em comum entre as duas tabelas hoje.
--
-- Então `p.*` volta a ser possível, e com ele a view para de ficar pra trás
-- sozinha: toda coluna nova de `projects` passa a aparecer no dia em que
-- nascer. Enquanto a lista for manual, o próximo campo novo repete este bug,
-- e ninguém vai lembrar de olhar aqui — a evidência é que já aconteceu duas
-- vezes (`diarias_contratadas` foi remendada em 23/07 pelo mesmo motivo).
--
-- Sem risco de vazar dinheiro: as colunas de valor moram em
-- `projects_financeiro`, entram por LEFT JOIN e a view é `security_invoker`,
-- então a RLS da lateral continua mandando. E `projects` já é lida direto
-- por várias telas — `p.*` aqui não abre nada que não estivesse aberto.
--
-- DROP + CREATE porque CREATE OR REPLACE exige a mesma ordem de colunas e só
-- deixa acrescentar no fim; `p.*` reordena. Medido antes: nada depende desta
-- view.
-- =========================================================================

DROP VIEW IF EXISTS public.projects_v;

CREATE VIEW public.projects_v AS
SELECT
  p.*,
  -- Só os campos de valor da lateral. `project_id` e `updated_at` ficam de
  -- fora: o primeiro é o mesmo `p.id` com outro nome, o segundo confundiria
  -- com o do projeto.
  f.sold_value,
  f.direct_costs,
  f.contract_value,
  f.invoiced_value,
  f.custo_hora_padrao,
  f.gross_margin_value,
  f.gross_margin_percent
FROM public.projects p
LEFT JOIN public.projects_financeiro f ON f.project_id = p.id;

ALTER VIEW public.projects_v SET (security_invoker = on);
GRANT SELECT ON public.projects_v TO authenticated;

COMMENT ON VIEW public.projects_v IS
  'Projeto + os valores da lateral projects_financeiro. Usa p.* de propósito: '
  'a lista manual de colunas fez a view ficar pra trás duas vezes, e campo '
  'que a view não expõe vira "não salva" na tela. security_invoker mantém a '
  'RLS da lateral valendo — quem não pode ver dinheiro recebe null.';

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE
  faltando text;
  n_marcados int;
  n_visiveis int;
  invoker boolean;
BEGIN
  -- 1. Nenhuma coluna de `projects` pode faltar na view. É a asserção que o
  --    remendo coluna-a-coluna nunca teve, e por isso o bug voltou.
  SELECT string_agg(c.column_name, ', ') INTO faltando
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'projects'
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns v
                      WHERE v.table_schema = 'public' AND v.table_name = 'projects_v'
                        AND v.column_name = c.column_name);
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'a view ainda não expõe: %', faltando;
  END IF;

  -- 2. Os valores da lateral continuam lá (um p.* sozinho teria perdido).
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='projects_v'
                    AND column_name='gross_margin_percent') THEN
    RAISE EXCEPTION 'a view perdeu os valores da lateral';
  END IF;

  -- 3. A RLS da lateral tem que continuar valendo.
  SELECT 'security_invoker=on' = ANY(c.reloptions) INTO invoker
    FROM pg_class c WHERE c.oid = 'public.projects_v'::regclass;
  IF NOT COALESCE(invoker, false) THEN
    RAISE EXCEPTION 'a view voltou a rodar como dona — a RLS do dinheiro parou de valer';
  END IF;

  -- 4. O caso concreto: os projetos que JÁ estavam fora do fechamento têm
  --    que aparecer assim pela view, que é por onde a ficha lê.
  SELECT count(*) INTO n_marcados FROM public.projects       WHERE faturamento <> 'mensal';
  SELECT count(*) INTO n_visiveis FROM public.projects_v     WHERE faturamento <> 'mensal';
  IF n_marcados <> n_visiveis THEN
    RAISE EXCEPTION 'tabela diz % projeto(s) fora do mensal, a view enxerga %', n_marcados, n_visiveis;
  END IF;

  RAISE NOTICE 'view completa · % projeto(s) fora do fechamento agora visíveis na ficha', n_marcados;
END $medicao$;
