-- =========================================================================
-- Um padrão só, em blocos: [0318][LITROS_DE_VANTAGEM]
--
-- Djêisson (11/08/2026), vendo a tela: "acho que vamos deixar padrão, o nome
-- do davinci mesmo... se não vai gerar confusão! sobre os entregáveis eu
-- concordo, podemos manter assim, mas talvez vale manter colchetes, não?"
--
-- Duas correções em cima do que subiu hoje de manhã:
--
-- 1. UM NOME SÓ. Ontem ficaram dois conceitos pra mesma ideia — "Nome cru" no
--    projeto e "Nome DaVinci" no entregável. Dois nomes pra mesma coisa é
--    como se perde a convenção. Agora é o padrão DaVinci nos dois, e a coluna
--    se chama `nome_padrao`.
--
-- 2. O COLCHETE VOLTA, e ele tem razão. Eu tirei alegando que quebrava
--    caminho — impreciso. Colchete é válido em nome de arquivo no macOS e no
--    Windows; ele só atrapalha em glob de shell, que não é o gesto dele
--    (arrastar pasta, abrir no DaVinci). O que o Windows PROÍBE de verdade é
--    \ / : * ? " < > | — e o pipe do "PÓS | Promoção" continua saindo, que
--    era o risco real deste acervo.
--
--    Fica o que resolve problema de verdade (acento, espaço, pipe) e volta o
--    que só ajudava a ler.
--
--      projeto     [0318][LITROS_DE_VANTAGEM]
--      entregável  [ADVR-4036][SPOT_DE_RADIO_01_FILME_MAE][16X9][V1]
--
-- O bloco separa sozinho: sem espaço e sem underscore entre eles.
--
-- ----------------------------------------------------------------- o preço
-- Ontem eu documentei que coluna gerada congela a régua e que mudá-la exige
-- DROP+ADD. É exatamente o que esta migration faz, menos de um dia depois —
-- então o preço era real e está sendo pago aqui, à vista. `projects_v` cai
-- antes do DROP porque depende da coluna (o event trigger a recria sozinha
-- nos dois ALTERs seguintes).
-- =========================================================================

/**
 * Formato do jeito que entra no nome: "16×9", "16 X 9", "9:16" → 16X9/9X16.
 *
 * O acervo tem de tudo — `9X16`, `1920x1080  `, `9x16 + 16x9`, `Rádio`,
 * `Personalizado`. Tudo passa pela mesma régua; o que era ruído no cadastro
 * continua sendo ruído no nome, mas ao menos previsível.
 */
CREATE OR REPLACE FUNCTION public.formato_cru(_formato text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT public.normalizar_nome_projeto(
    regexp_replace(translate(COALESCE(_formato, ''), '×:', 'xx'), '\s+', '', 'g')
  )
$$;

/**
 * Monta o nome em blocos, pulando os vazios: [a][b][c].
 *
 * Pular vazio é o que impede `[ADVR-4001][TESTE][][V1]` quando a peça não tem
 * formato — bloco vazio não é placeholder, é sujeira.
 */
CREATE OR REPLACE FUNCTION public.nome_padrao(_blocos text[])
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(string_agg('[' || b || ']', '' ORDER BY i), '')
    FROM unnest(_blocos) WITH ORDINALITY AS t(b, i)
   WHERE NULLIF(btrim(COALESCE(b, '')), '') IS NOT NULL
$$;

/**
 * Título do entregável sem o prefixo interno ("PÓS | ", "PROD | ").
 *
 * A remoção acontece DEPOIS de normalizar, sobre `POS_`/`PROD_`/`DESL_`: o
 * pipe já virou underscore ali, e comparar sem acento evita depender de
 * collation. "Posicionamento" não é afetado — o regex exige o underscore
 * logo após o prefixo.
 */
CREATE OR REPLACE FUNCTION public.titulo_cru_entregavel(_titulo text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    COALESCE(public.normalizar_nome_projeto(_titulo), ''),
    '^(POS|PROD|DESL)_', ''
  )
$$;

-- --------------------------------------------------- troca das colunas
-- projects_v depende da coluna (a view é `p.*`), então sai primeiro. O event
-- trigger trg_projects_v_sync a recria a cada ALTER TABLE — é o caminho que
-- a migration 20260807200000 deixou documentado e exercitado.
DROP VIEW IF EXISTS public.projects_v;

ALTER TABLE public.projects DROP COLUMN IF EXISTS nome_cru;
ALTER TABLE public.projects
  ADD COLUMN nome_padrao text
  GENERATED ALWAYS AS (
    public.nome_padrao(ARRAY[numero, public.base_nome_projeto(name)])
  ) STORED;

COMMENT ON COLUMN public.projects.nome_padrao IS
  'Nome padrão pra DaVinci/pasta, em blocos: [0318][LITROS_DE_VANTAGEM]. Sem '
  'acento, espaço ou pipe — o que o Windows proíbe e o que quebra entre Mac e '
  'Windows. Gerada: mudar a régua exige DROP+ADD (ver 20260811210000).';

ALTER TABLE public.deliverables DROP COLUMN IF EXISTS nome_cru;
ALTER TABLE public.deliverables
  ADD COLUMN nome_padrao text
  GENERATED ALWAYS AS (
    public.nome_padrao(ARRAY[
      codigo,
      public.titulo_cru_entregavel(titulo),
      public.formato_cru(formato),
      'V1'
    ])
  ) STORED;

COMMENT ON COLUMN public.deliverables.nome_padrao IS
  'Idem projects.nome_padrao, com formato e versão: '
  '[ADVR-4036][SPOT_DE_RADIO_01_FILME_MAE][16X9][V1].';

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int;
BEGIN
  -- 1. A régua dos blocos, isolada.
  IF public.nome_padrao(ARRAY['0318', 'LITROS_DE_VANTAGEM']) <> '[0318][LITROS_DE_VANTAGEM]' THEN
    RAISE EXCEPTION 'blocos errados: %', public.nome_padrao(ARRAY['0318','LITROS_DE_VANTAGEM']);
  END IF;
  -- Bloco vazio não vira [] no meio do nome.
  IF public.nome_padrao(ARRAY['ADVR-1', 'TESTE', '', 'V1']) <> '[ADVR-1][TESTE][V1]' THEN
    RAISE EXCEPTION 'bloco vazio virou sujeira: %', public.nome_padrao(ARRAY['ADVR-1','TESTE','','V1']);
  END IF;
  -- Formatos do acervo, incluindo os bagunçados.
  IF public.formato_cru('16×9') <> '16X9' OR public.formato_cru('16 X 9') <> '16X9'
     OR public.formato_cru('9:16') <> '9X16' OR public.formato_cru('1920x1080  ') <> '1920X1080' THEN
    RAISE EXCEPTION 'formato_cru errado (16x9=% / 9:16=%)', public.formato_cru('16×9'), public.formato_cru('9:16');
  END IF;
  -- O prefixo interno sai; palavra que só COMEÇA com "pos" não é mutilada.
  IF public.titulo_cru_entregavel('PÓS | Promoção Pinos e Buchas 02') <> 'PROMOCAO_PINOS_E_BUCHAS_02' THEN
    RAISE EXCEPTION 'prefixo não saiu: %', public.titulo_cru_entregavel('PÓS | Promoção Pinos e Buchas 02');
  END IF;
  IF public.titulo_cru_entregavel('Posicionamento da marca') <> 'POSICIONAMENTO_DA_MARCA' THEN
    RAISE EXCEPTION 'comeu o começo de uma palavra legítima: %', public.titulo_cru_entregavel('Posicionamento da marca');
  END IF;

  BEGIN
    DECLARE
      _cli uuid; _p uuid; _d uuid; _np text; _nd text;
    BEGIN
      SELECT id INTO _cli FROM public.clients LIMIT 1;

      -- Números fixos: nextval não volta com rollback, e queimar número de
      -- projeto/ADVR abriria buraco na numeração que amarra a pasta.
      INSERT INTO public.projects (name, numero, client_id, client_name)
      VALUES ('Litros de vantagem', '9998', _cli, '__teste__')
      RETURNING id, nome_padrao INTO _p, _np;

      IF _np <> '[9998][LITROS_DE_VANTAGEM]' THEN
        RAISE EXCEPTION 'RESULTADO:projeto: %', _np;
      END IF;

      INSERT INTO public.deliverables (project_id, titulo, codigo, formato)
      VALUES (_p, 'Spot de Rádio 01 - Filme Mãe', 'ADVR-9999', '16×9')
      RETURNING id, nome_padrao INTO _d, _nd;

      IF _nd <> '[ADVR-9999][SPOT_DE_RADIO_01_FILME_MAE][16X9][V1]' THEN
        RAISE EXCEPTION 'RESULTADO:entregavel: %', _nd;
      END IF;

      -- Sem formato, o bloco simplesmente não existe.
      UPDATE public.deliverables SET formato = NULL WHERE id = _d;
      SELECT nome_padrao INTO _nd FROM public.deliverables WHERE id = _d;
      IF _nd <> '[ADVR-9999][SPOT_DE_RADIO_01_FILME_MAE][V1]' THEN
        RAISE EXCEPTION 'RESULTADO:sem formato: %', _nd;
      END IF;

      _res := format('ok · %s · %s', _np, _nd);
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res NOT LIKE 'ok ·%' THEN RAISE EXCEPTION 'nome padrão: %', _res; END IF;

  -- A view voltou com a coluna nova (event trigger).
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='projects_v'
                    AND column_name='nome_padrao') THEN
    RAISE EXCEPTION 'projects_v não voltou com nome_padrao';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='projects_v'
                AND column_name='nome_cru') THEN
    RAISE EXCEPTION 'a view ficou com a coluna antiga';
  END IF;

  SELECT count(*) INTO _sobrou FROM public.projects WHERE client_name = '__teste__';
  IF _sobrou > 0 THEN
    RAISE EXCEPTION 'projeto de teste persistiu (%)', _sobrou;
  END IF;

  RAISE NOTICE 'nome padrão em blocos, um só pros dois — %', _res;
END $medicao$;
