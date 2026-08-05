-- =========================================================================
-- Orçamento ganha número — respeitando os 210 que já existem
--
-- A carta simples estampa "Orçamento #—" porque NENHUM dos 7 budgets tem
-- `budget_number`. A sequence `budget_number_seq` existe desde março e nunca
-- foi usada em INSERT nenhum: o número era um campo que ninguém preenchia.
--
-- O PERIGO ESTAVA EM SIMPLESMENTE LIGAR A SEQUENCE. Ela foi criada com
-- START 158, e os códigos de 4 dígitos JÁ estão em uso nos títulos —
-- [0307]_VESTIBULAR_27, [0226]_LINHAS_DE_CREDITO… Medido antes de mexer:
--
--   210 títulos com código  |  maior = 309
--
-- Ligar a sequence como está faria o próximo orçamento nascer #0158, em cima
-- de um código que já é de outro job. Numeração duplicada não dá erro em
-- lugar nenhum — só faz duas coisas atenderem pelo mesmo nome, pra sempre.
--
-- Então: a sequence pula pra depois do maior código em uso, e o backfill
-- REAPROVEITA o número que já está no título quando ele existe. Um orçamento
-- do projeto [0307] é o #0307 — não um número novo que contradiz a pasta.
-- =========================================================================

-- ------------------------------------------------- 1. sequence acima do topo
DO $$
DECLARE
  topo int;
  atual bigint;
BEGIN
  -- Maior código de 4 dígitos em uso: título de deal, nome de projeto ou o
  -- campo numero do projeto.
  SELECT GREATEST(
           COALESCE((SELECT MAX((regexp_match(title, '\[(\d{3,4})\]'))[1]::int) FROM public.deals
                      WHERE title ~ '\[\d{3,4}\]'), 0),
           COALESCE((SELECT MAX((regexp_match(name, '\[(\d{3,4})\]'))[1]::int) FROM public.projects
                      WHERE name ~ '\[\d{3,4}\]'), 0),
           COALESCE((SELECT MAX(numero::int) FROM public.projects WHERE numero ~ '^\d+$'), 0),
           COALESCE((SELECT MAX(budget_number) FROM public.budgets), 0)
         ) INTO topo;

  SELECT last_value INTO atual FROM public.budget_number_seq;
  IF atual <= topo THEN
    PERFORM setval('public.budget_number_seq', topo, true);   -- próximo = topo+1
    RAISE NOTICE 'sequence reposicionada: estava em %, maior código em uso é % → próximo será %',
      atual, topo, topo + 1;
  ELSE
    RAISE NOTICE 'sequence já está à frente (%), maior código em uso: %', atual, topo;
  END IF;
END $$;

-- ------------------------------------------- 2. backfill dos que já existem
-- Reaproveita o código do título quando ele existe; senão, tira da sequence
-- na ordem de criação, pra a numeração acompanhar a cronologia.
DO $$
DECLARE
  b record;
  doTitulo int;
  n int;
BEGIN
  FOR b IN
    SELECT bu.id, bu.deal_id, d.title
      FROM public.budgets bu
      LEFT JOIN public.deals d ON d.id = bu.deal_id
     WHERE bu.budget_number IS NULL
     ORDER BY bu.created_at
  LOOP
    doTitulo := NULLIF((regexp_match(COALESCE(b.title, ''), '\[(\d{3,4})\]'))[1], '')::int;

    IF doTitulo IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.budgets x WHERE x.budget_number = doTitulo) THEN
      n := doTitulo;
    ELSE
      n := nextval('public.budget_number_seq')::int;
    END IF;

    UPDATE public.budgets SET budget_number = n WHERE id = b.id;
  END LOOP;
END $$;

-- ------------------------------------------------- 3. daqui pra frente, sozinho
/**
 * Número no INSERT, no banco.
 *
 * Na tela seria mais fácil, e é justamente por isso que não vai lá: orçamento
 * nasce de três caminhos (editor, duplicação, intake) e o que esquecer de
 * numerar volta a estampar "#—" no documento do cliente.
 */
CREATE OR REPLACE FUNCTION public.tg_budget_numero()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.budget_number IS NULL THEN
    NEW.budget_number := nextval('public.budget_number_seq')::int;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_budget_numero ON public.budgets;
CREATE TRIGGER trg_budget_numero
  BEFORE INSERT ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.tg_budget_numero();

-- ---------------------------------------------------------------- medição
DO $$
DECLARE sem int; dup int; menor int; maior int;
BEGIN
  SELECT count(*) INTO sem FROM public.budgets WHERE budget_number IS NULL;
  SELECT count(*) INTO dup FROM (
    SELECT budget_number FROM public.budgets
     WHERE budget_number IS NOT NULL
     GROUP BY budget_number HAVING count(*) > 1) q;
  SELECT MIN(budget_number), MAX(budget_number) INTO menor, maior FROM public.budgets;

  IF sem > 0 THEN RAISE EXCEPTION 'ficaram % orçamentos sem número', sem; END IF;
  IF dup > 0 THEN RAISE EXCEPTION 'há % números repetidos entre orçamentos', dup; END IF;
  RAISE NOTICE 'todos numerados · faixa %..% · sem repetição', menor, maior;
END $$;
