-- =========================================================================
-- O nome fica como se escreve; o CRU existe pra copiar
--
-- Djêisson (11/08/2026): "no cadastro de nome de projeto e entregáveis,
-- permitir acentos e pontuações, mas quando a gente for copiar o nome pra
-- usar no davinci e em outros lugares, deixar sempre sem, cru mesmo, para
-- que não tenhamos problemas com acentos, espaços e etc, principalmente
-- entre mac e windows."
--
-- Isso corrige uma decisão minha de 26/07 que foi longe demais. Naquele dia
-- o objetivo era o código na frente do nome; o trigger, de quebra, passou a
-- NORMALIZAR o nome inteiro na gravação — e o nome digitado se perdia. O
-- estrago está no banco agora:
--
--   [0316]_MAQUINAS_DE_CARTOES_PRESENCA_EM     ("Máquinas", "Presença")
--   [0315]_GRAVACOES_EM_CRUZ_ALTA_E_IJUI       ("Gravações", "Ijuí")
--   [0317]_BLITZ_DE_PECAS                      ("Peças")
--
-- Eu tratei "seguro pro sistema de arquivos" e "nome do projeto" como a mesma
-- coisa. São duas: o cliente lê o primeiro, o DaVinci lê o segundo. A partir
-- daqui elas existem lado a lado.
--
--   name      [0317] Blitz de Peças          ← como se escreve, pro humano
--   nome_cru  0317_BLITZ_DE_PECAS            ← pro DaVinci, pasta, Mac↔Win
--
-- Entregável já aceitava acento ("PÓS | Promoção Pinos e Buchas 02"), então
-- lá só faltava o cru: ADVR-4021_POS_PROMOCAO_PINOS_E_BUCHAS_02.
--
-- O código sai do colchete no cru de propósito: `[` e `]` são justamente o
-- tipo de caractere que quebra script de shell e trava em sistema de arquivo
-- — manter o colchete no nome "seguro" seria não ter feito nada.
--
-- ------------------------------------------------------------ duplicidade
-- Ela também muda de natureza. Hoje o sistema renomeia SOZINHO e em silêncio
-- ("PODCAST" vira "PODCAST_0726"), e o pedido é o contrário: avisar e deixar
-- a pessoa decidir — "pode acontecer, mas aparece o aviso pedindo se a pessoa
-- quer seguir mesmo assim". Então o trigger para de renomear, e nasce
-- `projetos_mesmo_nome()` pra tela perguntar antes de criar.
--
-- É uma troca com preço declarado: quem criar por um caminho SEM tela
-- (converter orçamento, importação) não vê o aviso e o duplicado passa. Era
-- o que o rename automático cobria. Mas renomear escondido produzia nome que
-- ninguém reconhecia depois — e nome que o dono não reconhece é pior que
-- nome repetido que ele escolheu.
--
-- ------------------------------------------------------------------- preço
-- `nome_cru` é coluna GERADA (STORED): o valor existe no banco e vale pra
-- qualquer consumidor, não só pra tela que tem o botão. Em troca, ela
-- congela a régua no momento da criação — mudar `base_nome_projeto` no futuro
-- NÃO recalcula o que já está gravado. Quem mexer na régua recalcula assim:
--
--     ALTER TABLE public.projects DROP COLUMN nome_cru;
--     -- e recria com a definição nova (o event trigger ressincroniza a view)
--
-- Os 18 projetos já gravados com o nome destruído continuam como estão: a
-- grafia original não foi guardada em lugar nenhum e eu não vou adivinhar
-- acento. Renomear é um clique na ficha, e a partir de agora fica.
-- =========================================================================

-- ------------------------------------------------------------------ régua
-- `normalizar_nome_projeto` continua igual — ela é a régua do CRU, e é o que
-- deixou de ser aplicada ao nome de exibição.

/**
 * Tira o prefixo do código pra comparar dois títulos pelo nome de verdade.
 *
 * Aceita `[0317]_NOME` (formato antigo) e `[0317] Nome` (o novo): o acervo
 * de 187 projetos do ClickUp e os 18 já criados precisam continuar sendo
 * entendidos pela mesma função.
 */
CREATE OR REPLACE FUNCTION public.base_nome_projeto(_nome text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT public.normalizar_nome_projeto(
    regexp_replace(COALESCE(_nome, ''), '^\[[0-9]{4}\][_ ]?', '')
  )
$$;

/**
 * O título passa a preservar o que foi digitado. O trigger só garante o
 * código na frente — que é o que amarra orçamento → projeto → entregável →
 * pasta. Nada de normalizar, nada de renomear duplicado.
 */
CREATE OR REPLACE FUNCTION public.tg_projects_titulo()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE nome text;
BEGIN
  -- Importado do ClickUp mantém o nome de origem (#AAAADDMM_NOME).
  IF NEW.clickup_task_id IS NOT NULL THEN RETURN NEW; END IF;

  nome := btrim(COALESCE(NEW.name, ''));
  IF nome = '' THEN RETURN NEW; END IF;          -- sem nome, não inventa

  -- Já veio com o código na frente (recriação, importação, edição): não
  -- carimba de novo, senão vira [0317] [0317] Nome.
  IF nome ~ '^\[[0-9]{4}\]' THEN
    NEW.name := nome;
    RETURN NEW;
  END IF;

  NEW.name := '[' || COALESCE(NEW.numero, '0000') || '] ' || nome;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------ o nome cru
-- Coluna gerada e não função de tela: o valor vale pra exportação, API e
-- qualquer integração futura, não só pro botão de copiar.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS nome_cru text
  GENERATED ALWAYS AS (
    COALESCE(numero || '_', '') || COALESCE(public.base_nome_projeto(name), '')
  ) STORED;

COMMENT ON COLUMN public.projects.nome_cru IS
  'Nome seguro pra sistema de arquivos (DaVinci, pastas, Mac↔Windows): sem '
  'acento, sem pontuação, sem espaço, sem colchete. Gerada — não edite. '
  'Mudar a régua exige DROP+ADD da coluna (ver 20260811160000).';

ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS nome_cru text
  GENERATED ALWAYS AS (
    COALESCE(codigo || '_', '') || COALESCE(public.normalizar_nome_projeto(titulo), '')
  ) STORED;

COMMENT ON COLUMN public.deliverables.nome_cru IS
  'Idem projects.nome_cru: ADVR-4021_POS_PROMOCAO_PINOS_E_BUCHAS_02. O hífen '
  'do código fica — ele é o código, não pontuação de texto.';

-- --------------------------------------------------------- o aviso da tela
/**
 * Projetos que já usam este nome. A tela pergunta antes de criar.
 *
 * Devolve os de OUTROS clientes também, com a flag: "Institucional" repetido
 * entre clientes diferentes é normal e não merece alarme, mas repetido no
 * mesmo cliente é o caso que gera quatro projetos indistinguíveis. Quem
 * decide o peso é a tela — a função entrega os dois.
 */
CREATE OR REPLACE FUNCTION public.projetos_mesmo_nome(_client_id uuid, _nome text)
RETURNS TABLE (
  id uuid, name text, numero text, client_name text,
  mesmo_cliente boolean, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT p.id, p.name, p.numero, p.client_name,
         (p.client_id IS NOT DISTINCT FROM _client_id) AS mesmo_cliente,
         p.created_at
    FROM public.projects p
   WHERE public.base_nome_projeto(p.name) = public.base_nome_projeto(_nome)
     AND public.base_nome_projeto(_nome) IS NOT NULL
   ORDER BY (p.client_id IS NOT DISTINCT FROM _client_id) DESC, p.created_at DESC
   LIMIT 10
$$;

GRANT EXECUTE ON FUNCTION public.projetos_mesmo_nome(uuid, text) TO authenticated;

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int;
BEGIN
  -- 1. A régua entende os dois formatos de prefixo.
  IF public.base_nome_projeto('[0317] Blitz de Peças') <> 'BLITZ_DE_PECAS' THEN
    RAISE EXCEPTION 'prefixo novo não foi removido: %', public.base_nome_projeto('[0317] Blitz de Peças');
  END IF;
  IF public.base_nome_projeto('[0317]_BLITZ_DE_PECAS') <> 'BLITZ_DE_PECAS' THEN
    RAISE EXCEPTION 'o formato antigo parou de ser entendido';
  END IF;

  BEGIN
    DECLARE
      _cli uuid; _p1 uuid; _p2 uuid; _d uuid;
      _nome text; _cru text; _cru_d text; _quantos int; _mesmo boolean;
      -- Números FIXOS: o trigger só chama nextval quando vêm nulos, e queimar
      -- número de projeto abriria buraco na numeração que amarra o Drive.
      _num1 text := '9998'; _num2 text := '9999';
    BEGIN
      SELECT id INTO _cli FROM public.clients LIMIT 1;

      -- 2. O nome digitado sobrevive, com o código na frente.
      INSERT INTO public.projects (name, numero, client_id, client_name)
      VALUES ('Máquinas de Cartões — Presença em Ijuí', _num1, _cli, '__teste__')
      RETURNING id, name, nome_cru INTO _p1, _nome, _cru;

      IF _nome <> '[9998] Máquinas de Cartões — Presença em Ijuí' THEN
        RAISE EXCEPTION 'RESULTADO:o nome foi alterado na gravação: %', _nome;
      END IF;

      -- 3. E o cru é o que vai pro DaVinci: sem acento, sem colchete, sem
      --    espaço, sem travessão.
      IF _cru <> '9998_MAQUINAS_DE_CARTOES_PRESENCA_EM_IJUI' THEN
        RAISE EXCEPTION 'RESULTADO:cru errado: %', _cru;
      END IF;

      -- 4. Nome repetido NÃO é mais renomeado escondido.
      INSERT INTO public.projects (name, numero, client_id, client_name)
      VALUES ('Máquinas de Cartões — Presença em Ijuí', _num2, _cli, '__teste__')
      RETURNING id, name INTO _p2, _nome;

      IF _nome <> '[9999] Máquinas de Cartões — Presença em Ijuí' THEN
        RAISE EXCEPTION 'RESULTADO:o duplicado foi renomeado sozinho: %', _nome;
      END IF;

      -- 5. Mas a tela CONSEGUE perguntar: a função enxerga a colisão.
      SELECT count(*), bool_or(mesmo_cliente) INTO _quantos, _mesmo
        FROM public.projetos_mesmo_nome(_cli, 'maquinas de cartoes  presenca em ijui');
      IF _quantos < 2 OR NOT _mesmo THEN
        RAISE EXCEPTION 'RESULTADO:a checagem não achou a colisão (% achados)', _quantos;
      END IF;

      -- 6. Entregável: título com acento e pontuação intactos, cru ao lado.
      INSERT INTO public.deliverables (project_id, titulo, codigo)
      VALUES (_p1, 'PÓS | Promoção Pinos e Buchas 02', 'ADVR-9999')
      RETURNING id, titulo, nome_cru INTO _d, _nome, _cru_d;

      IF _nome <> 'PÓS | Promoção Pinos e Buchas 02' THEN
        RAISE EXCEPTION 'RESULTADO:o título do entregável foi alterado: %', _nome;
      END IF;
      IF _cru_d <> 'ADVR-9999_POS_PROMOCAO_PINOS_E_BUCHAS_02' THEN
        RAISE EXCEPTION 'RESULTADO:cru do entregável errado: %', _cru_d;
      END IF;

      _res := format('ok · projeto=%s · entregavel=%s', _cru, _cru_d);
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res NOT LIKE 'ok ·%' THEN RAISE EXCEPTION 'nome/cru: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.projects WHERE client_name = '__teste__';
  IF _sobrou > 0 THEN
    RAISE EXCEPTION 'projeto de teste persistiu (%) — a subtransação não desfez', _sobrou;
  END IF;

  RAISE NOTICE 'nome como se escreve + cru pra copiar, duplicado passa e a tela pergunta — %', _res;
END $medicao$;
