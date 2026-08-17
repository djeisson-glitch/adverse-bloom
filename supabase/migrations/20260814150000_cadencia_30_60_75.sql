-- =========================================================================
-- Cadência mais longa: quente 30 · morno 60 · frio 75
--
-- Djêisson (14/08/2026): "sobre a temperatura e dias, acho que está muito
-- curto. vamos trabalhar no geral com 60 dias para morno e quente 30 dias e
-- frio 75 dias."
--
-- Os números de 11/08 (7 / 21 / 30) vieram de mim, não da operação dele — e
-- em duas semanas de uso ele viu que voltar num lead frio a cada 30 dias é
-- perseguição, não nutrição. Quem sabe o ritmo do próprio mercado é ele.
--
--   antes    quente 7   morno 21   frio 30
--   agora    quente 30  morno 60   frio 75
--
-- O que NÃO muda: a data já combinada em cada lead. A cadência decide o
-- PRÓXIMO padrão, e reescrever as datas existentes apagaria combinados reais
-- ("volto em novembro") por causa de uma regra que mudou depois.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.lead_cadencia_dias(_temperatura text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _temperatura
           WHEN 'quente' THEN 30
           WHEN 'morno'  THEN 60
           ELSE 75              -- frio, e qualquer coisa desconhecida
         END
$$;

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int; hoje date := public.hoje_br();
BEGIN
  IF public.lead_cadencia_dias('quente') <> 30 THEN RAISE EXCEPTION 'quente deveria ser 30'; END IF;
  IF public.lead_cadencia_dias('morno')  <> 60 THEN RAISE EXCEPTION 'morno deveria ser 60'; END IF;
  IF public.lead_cadencia_dias('frio')   <> 75 THEN RAISE EXCEPTION 'frio deveria ser 75'; END IF;
  -- Desconhecido continua caindo no mais frouxo — na dúvida, cobrar menos.
  IF public.lead_cadencia_dias('morninho') <> 75 THEN RAISE EXCEPTION 'desconhecido deveria cair em 75'; END IF;

  BEGIN
    DECLARE _l uuid; _dono uuid; _d date;
    BEGIN
      SELECT id INTO _dono FROM public.profiles LIMIT 1;
      INSERT INTO public.leads (nome, empresa, temperatura, status, responsavel_id)
      VALUES ('__teste_cadencia__', 'Teste', 'frio', 'novo', _dono) RETURNING id INTO _l;

      -- Interação sem data escolhida → 75 dias.
      INSERT INTO public.lead_interacoes (lead_id, tipo, descricao) VALUES (_l, 'email', 'toque');
      SELECT proximo_toque INTO _d FROM public.leads WHERE id = _l;
      IF _d <> hoje + 75 THEN RAISE EXCEPTION 'RESULTADO:frio não aplicou 75 (deu %)', _d; END IF;

      -- Trocar pra quente reagenda em 30.
      UPDATE public.leads SET temperatura = 'quente' WHERE id = _l;
      SELECT proximo_toque INTO _d FROM public.leads WHERE id = _l;
      IF _d <> hoje + 30 THEN RAISE EXCEPTION 'RESULTADO:quente não aplicou 30 (deu %)', _d; END IF;

      -- E a data combinada à mão continua ganhando da cadência.
      INSERT INTO public.lead_interacoes (lead_id, tipo, descricao, proximo_toque)
      VALUES (_l, 'ligacao', 'pediu pra voltar depois', hoje + 200);
      SELECT proximo_toque INTO _d FROM public.leads WHERE id = _l;
      IF _d <> hoje + 200 THEN RAISE EXCEPTION 'RESULTADO:a data escrita perdeu pra cadência (deu %)', _d; END IF;

      _res := 'ok';
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res <> 'ok' THEN RAISE EXCEPTION 'cadência: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.leads WHERE nome = '__teste_cadencia__';
  IF _sobrou > 0 THEN RAISE EXCEPTION 'lead de teste persistiu (%)', _sobrou; END IF;

  RAISE NOTICE 'cadência 30/60/75; datas já combinadas ficam como estão';
END $medicao$;
