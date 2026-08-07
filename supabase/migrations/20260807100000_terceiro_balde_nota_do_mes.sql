-- =========================================================================
-- Terceiro balde: no mês, mas em nota separada
--
-- Pedido do Djêisson (07/08/2026): "precisamos criar uma terceira opção —
-- faturamento à parte dentro do mês. pq vamos ter o fechamento do mês que é
-- do dia a dia, faturado a parte que são outros projetos e vamos ter agora
-- tb o do dia a dia mas que precisa ser faturado a parte (por conta de
-- divisões de áreas)."
--
-- Os dois baldes de hoje respondem "de onde vem o dinheiro". O terceiro
-- responde outra pergunta — "em qual PAPEL isso sai" — e por isso não cabia
-- em nenhum dos dois:
--
--   mensal           dia a dia, preço do mês, nota do mês
--   mensal_separado  dia a dia, preço do mês, NOTA PRÓPRIA      ← novo
--   avulso           outro projeto, preço por hora, nota própria
--
-- A diferença entre os dois últimos é o PREÇO, não o documento. O avulso é
-- trabalho fora do combinado e sai por hora; o novo é o mesmo dia a dia que
-- já está na tabela (ou no valor-hora) do cliente — só vai pra outra nota
-- porque quem paga é outra área dele. Cobrar por hora o que a tabela já
-- precifica quebraria o acordo comercial.
--
-- SEM divisão por área (decisão dele): tudo que for marcado cai numa nota
-- separada só. Se um dia forem duas áreas no mesmo mês, é aqui que entra um
-- rótulo — e aí vale cadastrar as áreas por cliente em vez de digitar, senão
-- "Marketing" e "marketing" viram duas notas.
--
-- Esta migration só abre os CHECKs; quem usa o valor é a próxima.
-- =========================================================================

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_faturamento_ck;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_faturamento_ck
  CHECK (faturamento IN ('mensal', 'mensal_separado', 'avulso'));

ALTER TABLE public.deliverables DROP CONSTRAINT IF EXISTS deliverables_faturamento_ck;
ALTER TABLE public.deliverables
  ADD CONSTRAINT deliverables_faturamento_ck
  CHECK (faturamento IN ('mensal', 'mensal_separado', 'avulso'));

COMMENT ON COLUMN public.deliverables.faturamento IS
  'Como ESTA peça é faturada. NULL = segue o projeto (o normal). '
  '''mensal'' entra no fechamento; ''mensal_separado'' usa o preço do mês mas '
  'sai em nota própria; ''avulso'' é outro projeto, cobrado por hora. '
  'Ver view deliverables_faturamento.';

-- ---------------------------------------------------------------- medição
-- O CHECK novo tem que ACEITAR os três valores e RECUSAR qualquer outro.
-- Só testar a aceitação deixaria passar um CHECK escrito larguinho demais,
-- que aceitaria um typo ('mensal_separada') e sumiria com a peça de todos os
-- baldes — porque o COALESCE da view devolveria um valor que nenhum filtro
-- casa. Peça que some do fechamento é dinheiro que não é cobrado.
DO $medicao$
DECLARE
  alvo uuid;
  v text;
  recusou boolean;
BEGIN
  SELECT id INTO alvo FROM public.deliverables LIMIT 1;
  IF alvo IS NULL THEN RAISE NOTICE 'sem peças pra testar o CHECK'; RETURN; END IF;

  FOREACH v IN ARRAY ARRAY['mensal', 'mensal_separado', 'avulso'] LOOP
    UPDATE public.deliverables SET faturamento = v WHERE id = alvo;
  END LOOP;

  recusou := false;
  BEGIN
    UPDATE public.deliverables SET faturamento = 'mensal_separada' WHERE id = alvo;
  EXCEPTION WHEN check_violation THEN recusou := true;
  END;
  IF NOT recusou THEN RAISE EXCEPTION 'o CHECK aceitou um valor inválido'; END IF;

  -- Devolve a peça ao estado original: herdando o projeto.
  UPDATE public.deliverables SET faturamento = NULL WHERE id = alvo;
  IF (SELECT faturamento FROM public.deliverables WHERE id = alvo) IS NOT NULL THEN
    RAISE EXCEPTION 'a peça de teste não voltou a herdar o projeto';
  END IF;

  RAISE NOTICE 'CHECK aceita os três baldes e recusa o resto';
END $medicao$;
