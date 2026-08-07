-- =========================================================================
-- `p.*` NÃO resolve: o Postgres expande o asterisco uma vez e congela
--
-- Correção de um erro meu de hoje mais cedo. Em 20260807140000 troquei a
-- lista manual de colunas de `projects_v` por `SELECT p.*` afirmando que
-- assim a view pararia de ficar pra trás. Não para: `CREATE VIEW ... p.*`
-- resolve o asterisco no momento da criação e grava a lista expandida. A
-- view nasceu completa e voltou a atrasar na primeira coluna nova.
--
-- Provado poucas horas depois: `projects.valor_fechamento` (criada em
-- 20260807170000) não aparecia na view, e a API respondia 400 pra ela —
-- exatamente o mesmo sintoma de "as alterações não estão persistindo" que a
-- correção anterior deveria ter encerrado.
--
-- A CAUSA REAL nunca foi a lista manual. É que existe uma view obrigada a
-- espelhar uma tabela, e nada garante o espelho. Corrigir a lista — na mão
-- ou por asterisco — conserta o dia, não a classe. Já foram três vezes:
-- `diarias_contratadas` (23/07), as cinco de hoje de manhã, e esta.
--
-- ENTÃO O ESPELHO PASSA A SE MANTER SOZINHO. Um event trigger recria a view
-- sempre que `public.projects` muda de forma. Não é um remendo esperto: é a
-- única peça que faltava pra "a view reflete a tabela" ser uma verdade que o
-- banco sustenta, em vez de uma que alguém precisa lembrar.
--
-- Segurança da recriação automática:
--   · só dispara quando o ALTER foi na própria `public.projects` — sem isso
--     a recriação da view dispararia o trigger de novo, em laço;
--   · se um dia algo passar a depender de `projects_v`, o DROP falha e o
--     ALTER falha junto. Falha alta e imediata, na migration de quem mexeu —
--     e não silenciosa, seis semanas depois, numa tela que não salva;
--   · `security_invoker` e o GRANT são reaplicados a cada recriação, senão a
--     RLS do dinheiro pararia de valer no primeiro ALTER.
--
-- O PREÇO, declarado: com `p.*` a view depende de cada coluna, então
-- REMOVER uma coluna de `projects` passa a ser bloqueado — o Postgres avisa
-- "view projects_v depends on column X". Quem for remover escreve uma linha
-- a mais:
--
--     DROP VIEW public.projects_v;
--     ALTER TABLE public.projects DROP COLUMN x;   -- o trigger recria a view
--
-- É o lado certo do tradeoff: acrescentar coluna é o que acontece toda
-- semana e já quebrou três telas em silêncio; remover é raro, deliberado, e
-- agora falha alto com a instrução na própria mensagem de erro. A medição
-- abaixo exercita esse caminho pra ele não ser teoria.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.sincronizar_projects_v()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DROP VIEW IF EXISTS public.projects_v;
  CREATE VIEW public.projects_v AS
  SELECT
    p.*,
    -- Só os campos de valor da lateral. `project_id` é o mesmo `p.id` com
    -- outro nome e `updated_at` confundiria com o do projeto.
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
    'Projeto + os valores da lateral projects_financeiro. NÃO edite esta view '
    'à mão: ela é recriada por public.sincronizar_projects_v() sempre que '
    'public.projects muda de forma (event trigger trg_projects_v_sync). '
    'security_invoker mantém a RLS da lateral valendo.';
END $$;

/**
 * Quando `projects` muda de forma, o espelho acompanha.
 *
 * O filtro por objid é o que impede o laço: a recriação da view também
 * dispara ddl_command_end, e sem o filtro ela se recriaria pra sempre.
 */
CREATE OR REPLACE FUNCTION public.tg_projects_v_sync()
RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF r.object_identity = 'public.projects' AND r.command_tag = 'ALTER TABLE' THEN
      PERFORM public.sincronizar_projects_v();
      EXIT;
    END IF;
  END LOOP;
END $$;

DROP EVENT TRIGGER IF EXISTS trg_projects_v_sync;
CREATE EVENT TRIGGER trg_projects_v_sync
  ON ddl_command_end
  WHEN TAG IN ('ALTER TABLE')
  EXECUTE FUNCTION public.tg_projects_v_sync();

-- Põe a view em dia agora (é o que traz valor_fechamento).
SELECT public.sincronizar_projects_v();

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE faltando text; pegou boolean; invoker boolean;
BEGIN
  -- 1. A view está em dia AGORA.
  SELECT string_agg(c.column_name, ', ') INTO faltando
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'projects'
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns v
                      WHERE v.table_schema = 'public' AND v.table_name = 'projects_v'
                        AND v.column_name = c.column_name);
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'a view ainda não expõe: %', faltando; END IF;

  -- 2. E o espelho se mantém SOZINHO. Este é o teste que a correção anterior
  --    não tinha — ela provou que a view estava completa naquele instante, o
  --    que era verdade e não era o suficiente. Aqui a coluna nasce DEPOIS.
  ALTER TABLE public.projects ADD COLUMN __teste_espelho__ int;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='projects_v'
                    AND column_name='__teste_espelho__') INTO pegou;
  IF NOT pegou THEN
    RAISE EXCEPTION 'o espelho não acompanhou: coluna nova em projects não apareceu na view';
  END IF;

  -- 3. E o caminho de REMOVER: a view depende da coluna, então sai primeiro
  --    e o trigger a recria no ALTER. É o preço declarado no cabeçalho,
  --    exercitado aqui pra não ser teoria.
  DROP VIEW public.projects_v;
  ALTER TABLE public.projects DROP COLUMN __teste_espelho__;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.projects_v'::regclass) THEN
    RAISE EXCEPTION 'a view não voltou depois de remover a coluna';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='projects_v'
                AND column_name='__teste_espelho__') THEN
    RAISE EXCEPTION 'a view ficou com uma coluna que a tabela não tem mais';
  END IF;

  -- 4. A RLS do dinheiro continua valendo depois de recriar. (O ANY precisa
  --    do array numa variável: subquery inline dentro de ANY() o Postgres lê
  --    como escalar e tenta converter o texto pra array.)
  SELECT 'security_invoker=on' = ANY(c.reloptions) INTO invoker
    FROM pg_class c WHERE c.oid = 'public.projects_v'::regclass;
  IF NOT COALESCE(invoker, false) THEN
    RAISE EXCEPTION 'a view voltou a rodar como dona — a RLS do dinheiro parou de valer';
  END IF;

  RAISE NOTICE 'espelho em dia e se mantendo sozinho (testado com coluna nascida depois)';
END $medicao$;
