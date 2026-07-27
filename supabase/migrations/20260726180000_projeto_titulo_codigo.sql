-- =========================================================================
-- Título do projeto: [XXXX]_NOME_DO_PROJETO
--
-- Decisão do Djêisson (26/07/2026):
--   • Projeto IMPORTADO do ClickUp fica como está (#AAAADDMM_NOME) — não se
--     mexe no acervo.
--   • Projeto NOVO nasce com o número de 4 dígitos na frente, o mesmo que já
--     vem do orçamento. Assim o código amarra orçamento → projeto → entregável
--     → pasta no Drive.
--   • Nome repetido dentro de um contrato/faturamento mensal é o problema
--     real: "PODCAST" todo mês vira quatro projetos indistinguíveis. O
--     sistema passa a NÃO deixar criar igual — acrescenta uma variação.
--
-- Fica num trigger só porque existem TRÊS caminhos que criam projeto
-- (converter_orcamento_em_projeto, ganhar_orcamento_gerar_job e o insert
-- manual do front). Tratar um por um deixaria os outros duplicando.
-- =========================================================================

/**
 * Normaliza pra comparar e pra compor o título: sem acento, maiúsculo,
 * separado por underscore. `unaccent` não está instalado, então a troca é
 * explícita — o conjunto abaixo cobre o português.
 */
CREATE OR REPLACE FUNCTION public.normalizar_nome_projeto(_txt text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        upper(translate(
          COALESCE(_txt, ''),
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
        )),
        '[^A-Z0-9]+', '_', 'g'      -- tudo que não é letra/número vira _
      ),
      '^_+|_+$', '', 'g'            -- tira _ das pontas
    ), ''
  )
$$;

/** Tira o prefixo [XXXX]_ pra comparar dois títulos pelo nome de verdade. */
CREATE OR REPLACE FUNCTION public.base_nome_projeto(_nome text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT public.normalizar_nome_projeto(
    regexp_replace(COALESCE(_nome, ''), '^\[[0-9]{4}\]_', '')
  )
$$;

CREATE OR REPLACE FUNCTION public.tg_projects_titulo()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base      text;
  candidato text;
  ref       text;
  n         int := 2;
BEGIN
  -- Importado do ClickUp mantém o nome de origem. O acervo não se mexe, e
  -- uma reimportação não pode reescrever 189 títulos.
  IF NEW.clickup_task_id IS NOT NULL THEN RETURN NEW; END IF;

  base := public.base_nome_projeto(NEW.name);
  IF base IS NULL THEN RETURN NEW; END IF;   -- sem nome, não inventa

  -- Já existe projeto do MESMO CLIENTE com esse nome? Acrescenta o mês de
  -- referência, que é o que distingue trabalho recorrente ("PODCAST" de
  -- julho x de agosto). Se ainda assim colidir (dois no mesmo mês), numera.
  IF EXISTS (
    SELECT 1 FROM public.projects p
     WHERE p.client_id IS NOT DISTINCT FROM NEW.client_id
       AND public.base_nome_projeto(p.name) = base
  ) THEN
    ref := to_char(COALESCE(NEW.sold_date, CURRENT_DATE), 'MMYY');
    candidato := base || '_' || ref;

    WHILE EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.client_id IS NOT DISTINCT FROM NEW.client_id
         AND public.base_nome_projeto(p.name) = candidato
    ) LOOP
      candidato := base || '_' || ref || '_' || n;
      n := n + 1;
    END LOOP;
    base := candidato;
  END IF;

  -- O número já foi carimbado pelo trg_projects_numero (BEFORE INSERT roda em
  -- ordem alfabética: "numero" vem antes de "titulo").
  NEW.name := '[' || COALESCE(NEW.numero, '0000') || ']_' || base;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_titulo ON public.projects;
CREATE TRIGGER trg_projects_titulo
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_projects_titulo();

-- Busca por nome de projeto fica rápida mesmo comparando pela base.
CREATE INDEX IF NOT EXISTS idx_projects_base_nome
  ON public.projects (client_id, public.base_nome_projeto(name));

GRANT EXECUTE ON FUNCTION public.normalizar_nome_projeto(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.base_nome_projeto(text)       TO authenticated;
