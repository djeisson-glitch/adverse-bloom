-- =========================================================================
-- A etapa larga a peça quando ela sai da produção
--
-- Djêisson (07/08/2026): "os materiais serem passados de etapa para etapa
-- (tipo pro color e etc) não está funcionando da forma correta... e também,
-- acho que está um pouco confuso o fluxo/botões."
--
-- Medindo antes de mexer, três peças estão passadas pra outra pessoa — e
-- duas delas mostram o problema de cara:
--
--   PÓS | Depoimento Clien   status com_cliente   etapa color · com Djêisson
--   PÓS | Diretores — Comp   status pronto        etapa color · com Djêisson
--   Dia a dia GN Agro        status em_pausa      etapa montagem · com José
--
-- Nas duas primeiras os dois eixos contam histórias diferentes da MESMA
-- peça: o status diz "já foi pro cliente" / "pronto pra enviar", e a etapa
-- diz "está em color, com o Djêisson". Nada concilia os dois, e é daí que
-- vem a sensação de fluxo confuso — não é excesso de botão, é a tela
-- afirmando duas coisas incompatíveis ao mesmo tempo.
--
-- A REGRA que faltava: `etapa_responsavel_id` responde "quem está com a peça
-- na bancada AGORA". Isso só existe enquanto a peça está em produção. Assim
-- que ela sobe pra revisão, pro cliente ou pra entregue, ninguém está com
-- ela — e continuar apontando alguém é dizer que há trabalho onde não há.
--
-- `etapa_atual` NÃO é limpa: ela é onde a peça parou, e isso é histórico
-- legítimo ("essa peça foi até o color"). O que sai é o DONO. Se a peça
-- voltar pra produção por um ajuste, ela volta na mesma etapa e sem dono —
-- e aparece pro responsável, que é quem responde por ela.
--
-- O outro lado deste conserto é a Minha mesa, que filtrava só por
-- `responsavel_id` e por isso nunca entregava a peça a quem a recebeu. Vai
-- no mesmo PR.
-- =========================================================================

/**
 * Status em que alguém está de fato com a peça na mão.
 *
 * Função e não lista solta no trigger: a Minha mesa e a tela do entregável
 * precisam da mesma régua, e três cópias da mesma lista é como elas
 * divergem.
 */
CREATE OR REPLACE FUNCTION public.status_em_producao(_status text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _status IN ('pendente', 'em_edicao', 'em_pausa', 'ajuste_interno', 'ajuste_solicitado')
$$;

CREATE OR REPLACE FUNCTION public.tg_etapa_solta_a_peca()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT public.status_em_producao(NEW.status)
     AND NEW.etapa_responsavel_id IS NOT NULL THEN
    NEW.etapa_responsavel_id := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_etapa_solta_a_peca ON public.deliverables;
CREATE TRIGGER trg_etapa_solta_a_peca
  BEFORE UPDATE OF status ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_etapa_solta_a_peca();

-- ------------------------------------------------- limpeza do que já ficou
-- As peças que hoje estão fora da produção com dono de etapa pendurado. O
-- trigger só pega mudanças daqui pra frente; estas já estão erradas na tela.
UPDATE public.deliverables
   SET etapa_responsavel_id = NULL
 WHERE etapa_responsavel_id IS NOT NULL
   AND NOT public.status_em_producao(status);

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE incoerentes int; alvo uuid; ficou uuid; dono uuid;
BEGIN
  -- 1. Ninguém mais está "com a peça" fora da produção.
  SELECT count(*) INTO incoerentes FROM public.deliverables
   WHERE etapa_responsavel_id IS NOT NULL AND NOT public.status_em_producao(status);
  IF incoerentes > 0 THEN
    RAISE EXCEPTION '% peça(s) fora da produção ainda com dono de etapa', incoerentes;
  END IF;

  -- 2. E o trigger segura o caso novo. Testa numa peça de produção de
  --    verdade: põe um dono de etapa, sobe o status e confere que largou.
  SELECT id, responsavel_id INTO alvo, dono FROM public.deliverables
   WHERE public.status_em_producao(status) AND responsavel_id IS NOT NULL LIMIT 1;

  IF alvo IS NULL THEN
    RAISE NOTICE 'sem peça em produção pra exercitar o trigger';
  ELSE
    DECLARE st_antes text; etapa_antes uuid;
    BEGIN
      SELECT status, etapa_responsavel_id INTO st_antes, etapa_antes
        FROM public.deliverables WHERE id = alvo;

      UPDATE public.deliverables SET etapa_responsavel_id = dono WHERE id = alvo;
      UPDATE public.deliverables SET status = 'pronto' WHERE id = alvo;
      SELECT etapa_responsavel_id INTO ficou FROM public.deliverables WHERE id = alvo;

      -- devolve a peça exatamente como estava
      UPDATE public.deliverables
         SET status = st_antes, etapa_responsavel_id = etapa_antes WHERE id = alvo;

      IF ficou IS NOT NULL THEN
        RAISE EXCEPTION 'o trigger não largou a peça ao sair da produção';
      END IF;
    END;
  END IF;

  RAISE NOTICE 'etapa larga a peça fora da produção, e o histórico (etapa_atual) fica';
END $medicao$;
