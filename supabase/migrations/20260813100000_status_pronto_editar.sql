-- =========================================================================
-- Novo status: "Pronto pra editar"
--
-- Djêisson (13/08/2026): "se o video está pendente, ele n fica disponivel pra
-- editar. inclusive, podemos adicionar mais um status: pronto pra editar. que
-- é quando o cliente termina de enviar os arquivos/briefing e a gente pode
-- iniciar a edição. assim fica bem separado, nao fica confuso. nessa etapa de
-- pendente, aparece o botao pra coordenação de projetos: enviar para edição e
-- ai sim aparece pro editor."
--
-- Hoje `pendente` significa duas coisas ao mesmo tempo — "chegou e ainda falta
-- material do cliente" e "pode começar" — e a peça cai na mesa do editor nas
-- duas. Ele abre, não tem arquivo, fecha. Da próxima vez já não confia na
-- própria mesa, que é o pior estrago possível numa lista de trabalho.
--
--   pendente        chegou, falta material/briefing   → COORDENAÇÃO
--   pronto_editar   coordenação liberou               → EDITOR
--   em_edicao       rodando
--
-- `pronto_editar` É produção (a peça está com a gente, ninguém de fora
-- segura), então entra em `status_em_producao` — é essa função que decide se
-- a etapa mantém dono e se a peça conta como "na nossa mão".
--
-- Nada é migrado automaticamente: as peças hoje em `pendente` continuam em
-- `pendente`, e a coordenação libera as que já têm material. Mover 100 peças
-- em massa seria afirmar que todas estão prontas — exatamente a confusão que
-- este status veio desfazer.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.status_em_producao(_status text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _status IN (
    'pendente', 'pronto_editar', 'em_edicao', 'em_pausa',
    'ajuste_interno', 'ajuste_solicitado'
  )
$$;

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int; _pend int;
BEGIN
  IF NOT public.status_em_producao('pronto_editar') THEN
    RAISE EXCEPTION 'pronto_editar não conta como produção — a etapa perderia o dono';
  END IF;
  -- E os que já eram continuam sendo (não quebrei a lista ao reescrevê-la).
  IF NOT (public.status_em_producao('pendente') AND public.status_em_producao('em_edicao')
          AND public.status_em_producao('em_pausa') AND public.status_em_producao('ajuste_interno')
          AND public.status_em_producao('ajuste_solicitado')) THEN
    RAISE EXCEPTION 'a lista de produção perdeu um status no caminho';
  END IF;
  IF public.status_em_producao('aprovado') OR public.status_em_producao('com_cliente') THEN
    RAISE EXCEPTION 'status fora da produção entrou na lista';
  END IF;

  BEGIN
    DECLARE _cli uuid; _p uuid; _d uuid; _st text; _dono uuid; _u uuid;
    BEGIN
      SELECT id INTO _cli FROM public.clients LIMIT 1;
      SELECT id INTO _u FROM public.profiles LIMIT 1;

      INSERT INTO public.projects (name, numero, client_id, client_name)
      VALUES ('Teste pronto editar', '9998', _cli, '__teste__') RETURNING id INTO _p;

      INSERT INTO public.deliverables (project_id, titulo, codigo, status, etapa_responsavel_id)
      VALUES (_p, 'Peça', 'ADVR-9999', 'pendente', _u) RETURNING id INTO _d;

      -- Liberar pra edição mantém o dono da etapa: continua sendo produção.
      UPDATE public.deliverables SET status = 'pronto_editar' WHERE id = _d;
      SELECT status, etapa_responsavel_id INTO _st, _dono FROM public.deliverables WHERE id = _d;
      IF _st <> 'pronto_editar' THEN RAISE EXCEPTION 'RESULTADO:status não gravou (%)', _st; END IF;
      IF _dono IS NULL THEN
        RAISE EXCEPTION 'RESULTADO:a etapa largou a peça ao liberar pra edição';
      END IF;

      -- Já sair da produção (ex.: pro cliente) continua soltando o dono.
      UPDATE public.deliverables SET status = 'com_cliente' WHERE id = _d;
      SELECT etapa_responsavel_id INTO _dono FROM public.deliverables WHERE id = _d;
      IF _dono IS NOT NULL THEN
        RAISE EXCEPTION 'RESULTADO:a etapa segurou a peça fora da produção';
      END IF;

      _res := 'ok';
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res <> 'ok' THEN RAISE EXCEPTION 'pronto_editar: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.projects WHERE client_name = '__teste__';
  IF _sobrou > 0 THEN RAISE EXCEPTION 'projeto de teste persistiu (%)', _sobrou; END IF;

  -- Quantas peças a coordenação vai encontrar pra liberar.
  SELECT count(*) INTO _pend FROM public.deliverables WHERE status = 'pendente';
  RAISE NOTICE 'pronto_editar entra na produção; % peça(s) seguem em pendente pra coordenação liberar', _pend;
END $medicao$;
