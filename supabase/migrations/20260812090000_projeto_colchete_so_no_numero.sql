-- =========================================================================
-- Projeto: colchete SÓ no número. Blocos são coisa de entregável.
--
-- Djêisson (12/08/2026): "[0319][PROMOCAO_PINOS_E_BUCHAS] – os colchetes
-- ficam só no numero no nome do projeto, o resto apenas com o _. a regra dos
-- colchetes se aplica APENAS nos entregáveis!"
--
-- Erro meu de ontem: ele aprovou o formato em blocos olhando um exemplo que
-- mostrava projeto E entregável juntos, e eu apliquei a regra nos dois. A
-- regra era do entregável — onde os blocos separam código, nome, formato e
-- versão, que são quatro informações diferentes. O projeto tem duas, e ali o
-- underscore sempre bastou:
--
--     projeto     [0319]_PROMOCAO_PINOS_E_BUCHAS      ← muda aqui
--     entregável  [ADVR-4394][PROMOCAO...][9X16][V1]  ← fica como está
--
-- É também o formato que os projetos já vinham tendo (`[0316]_MAQUINAS...`),
-- e é a isso que ele se referiu ao dizer que renomear não devolvia "o
-- formato que estava ficando antes".
--
-- Pago de novo o preço da coluna gerada (DROP+ADD, com a view saindo antes).
-- Terceira vez em dois dias — vale registrar que é o custo real de manter o
-- nome como dado e não como cálculo de tela; ainda assim prefiro assim, para
-- que exportação e integração vejam o mesmo valor que o botão copia.
-- =========================================================================

/**
 * Nome padrão do PROJETO: `[0319]_PROMOCAO_PINOS_E_BUCHAS`.
 *
 * Colchete só no número — ele é a etiqueta que o olho procura na lista de
 * pastas. O resto é uma coisa só, e underscore basta.
 */
CREATE OR REPLACE FUNCTION public.nome_padrao_projeto(_numero text, _base text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE(NULLIF(btrim(_numero), ''), '') = '' THEN COALESCE(_base, '')
    WHEN COALESCE(NULLIF(btrim(_base),   ''), '') = '' THEN '[' || btrim(_numero) || ']'
    ELSE '[' || btrim(_numero) || ']_' || _base
  END
$$;

-- projects_v é `p.*`, então depende da coluna: sai antes do DROP e o event
-- trigger a recria nos dois ALTERs.
DROP VIEW IF EXISTS public.projects_v;

ALTER TABLE public.projects DROP COLUMN IF EXISTS nome_padrao;
ALTER TABLE public.projects
  ADD COLUMN nome_padrao text
  GENERATED ALWAYS AS (
    public.nome_padrao_projeto(numero, public.base_nome_projeto(name))
  ) STORED;

COMMENT ON COLUMN public.projects.nome_padrao IS
  'Nome padrão do projeto pra pasta/DaVinci: [0319]_PROMOCAO_PINOS_E_BUCHAS. '
  'Colchete só no número — blocos por informação são regra do ENTREGÁVEL '
  '(deliverables.nome_padrao), não do projeto. Gerada: mudar a régua exige '
  'DROP+ADD (ver 20260812090000).';

-- `deliverables.nome_padrao` NÃO é tocada de propósito: lá o formato em
-- blocos é o que ele confirmou e continua valendo.

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int; _amostra text;
BEGIN
  -- 1. A régua do projeto, isolada.
  IF public.nome_padrao_projeto('0319', 'PROMOCAO_PINOS_E_BUCHAS') <> '[0319]_PROMOCAO_PINOS_E_BUCHAS' THEN
    RAISE EXCEPTION 'formato do projeto errado: %', public.nome_padrao_projeto('0319','PROMOCAO_PINOS_E_BUCHAS');
  END IF;
  -- Sem número, ou sem nome, não sobra colchete solto nem underscore órfão.
  IF public.nome_padrao_projeto(NULL, 'SO_O_NOME') <> 'SO_O_NOME' THEN
    RAISE EXCEPTION 'sem número deu: %', public.nome_padrao_projeto(NULL, 'SO_O_NOME');
  END IF;
  IF public.nome_padrao_projeto('0319', NULL) <> '[0319]' THEN
    RAISE EXCEPTION 'sem nome deu: %', public.nome_padrao_projeto('0319', NULL);
  END IF;

  BEGIN
    DECLARE _cli uuid; _p uuid; _d uuid; _np text; _nd text;
    BEGIN
      SELECT id INTO _cli FROM public.clients LIMIT 1;

      INSERT INTO public.projects (name, numero, client_id, client_name)
      VALUES ('Promoção Pinos e Buchas', '9998', _cli, '__teste__')
      RETURNING id, nome_padrao INTO _p, _np;

      IF _np <> '[9998]_PROMOCAO_PINOS_E_BUCHAS' THEN
        RAISE EXCEPTION 'RESULTADO:projeto: %', _np;
      END IF;

      -- 2. E o ENTREGÁVEL continua em blocos — o ponto todo do pedido.
      INSERT INTO public.deliverables (project_id, titulo, codigo, formato)
      VALUES (_p, 'Promoçao Pinos e Buchas 02', 'ADVR-9999', '9x16')
      RETURNING id, nome_padrao INTO _d, _nd;

      IF _nd <> '[ADVR-9999][PROMOCAO_PINOS_E_BUCHAS_02][9X16][V1]' THEN
        RAISE EXCEPTION 'RESULTADO:entregavel mudou sem querer: %', _nd;
      END IF;

      -- 3. Renomear continua devolvendo o formato certo.
      UPDATE public.projects SET name = 'Outro nome' WHERE id = _p;
      SELECT nome_padrao INTO _np FROM public.projects WHERE id = _p;
      IF _np <> '[9998]_OUTRO_NOME' THEN
        RAISE EXCEPTION 'RESULTADO:apos renomear: %', _np;
      END IF;

      _res := format('ok · proj=%s · del=%s', _np, _nd);
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res NOT LIKE 'ok ·%' THEN RAISE EXCEPTION 'formato: %', _res; END IF;

  -- 4. Os projetos que já existem foram recalculados pela coluna nova.
  SELECT string_agg(nome_padrao, ' // ') INTO _amostra FROM (
    SELECT nome_padrao FROM public.projects
     WHERE clickup_task_id IS NULL AND nome_padrao <> '' ORDER BY created_at DESC LIMIT 3) z;
  IF _amostra LIKE '%][%' THEN
    RAISE EXCEPTION 'ainda há projeto em blocos: %', _amostra;
  END IF;

  SELECT count(*) INTO _sobrou FROM public.projects WHERE client_name = '__teste__';
  IF _sobrou > 0 THEN RAISE EXCEPTION 'projeto de teste persistiu (%)', _sobrou; END IF;

  RAISE NOTICE 'projeto com colchete só no número; entregável segue em blocos — % | amostra: %', _res, _amostra;
END $medicao$;
