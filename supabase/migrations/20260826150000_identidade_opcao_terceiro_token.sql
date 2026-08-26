-- A varredura de "nomes únicos em todos os lugares" achou uma TERCEIRA página
-- pública de proposta: /proposta/:token (PropostaPublica), que usa
-- proposal_letters — e que não definia título NENHUM. Ali o Ctrl+P do cliente
-- salvava como "Adverse OS.pdf": pior que nome repetido, é nome nenhum.
--
-- identidade_opcao passa a aceitar os TRÊS tokens públicos que existem:
--   budgets.public_token   (uuid) — /carta/:token
--   budget_shares.token    (uuid) — /orcamento/:token
--   proposal_letters.token (text) — /proposta/:token
--
-- Por isso o parâmetro vira `text`: um dos três não é uuid, e converter sem
-- checar estouraria a chamada em vez de devolver "token inválido".

DROP FUNCTION IF EXISTS public.identidade_opcao(uuid);

CREATE OR REPLACE FUNCTION public.identidade_opcao(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b     record;
  pos   int;
  qtd   int;
  num   text;
  _uuid uuid;
BEGIN
  IF _token IS NULL OR _token = '' THEN RETURN NULL; END IF;

  -- Converte só se for uuid de verdade. Sem esta guarda, um token de
  -- proposal_letters (que é texto livre) faria a função estourar.
  _uuid := CASE WHEN _token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN _token::uuid END;

  IF _uuid IS NOT NULL THEN
    SELECT * INTO b FROM public.budgets WHERE public_token = _uuid LIMIT 1;

    IF NOT FOUND THEN
      SELECT bb.* INTO b
        FROM public.budget_shares s
        JOIN public.budgets bb ON bb.id = s.budget_id
       WHERE s.token = _uuid
         AND s.revogado_em IS NULL
         AND (s.expira_em IS NULL OR s.expira_em >= now())
       LIMIT 1;
    END IF;
  END IF;

  IF b.id IS NULL THEN
    SELECT bb.* INTO b
      FROM public.proposal_letters pl
      JOIN public.budgets bb ON bb.id = pl.budget_id
     WHERE pl.token = _token
     LIMIT 1;
  END IF;

  IF b.id IS NULL THEN
    RETURN NULL;   -- token inválido: quem chama já trata
  END IF;

  SELECT d.numero INTO num FROM public.deals d WHERE d.id = b.deal_id;

  -- MESMA REGRA de src/lib/orcamentoDaCarta.ts → letraDaOpcao().
  -- Se mexer aqui, mexa lá: as duas existem porque a página pública tem um
  -- orçamento só em mãos e não consegue calcular a ordem sozinha.
  SELECT count(*), count(*) FILTER (WHERE o.created_at < b.created_at) + 1
    INTO qtd, pos
    FROM public.budgets o
   WHERE o.deal_id = b.deal_id
     AND o.is_latest_version IS NOT FALSE;

  RETURN jsonb_build_object(
    'numero',   num,
    'titulo',   b.project_name,
    -- Letra só quando existe mais de uma opção: num negócio com proposta
    -- única, "[0329A]" seria ruído sem informação.
    'letra',    CASE WHEN qtd < 2 THEN '' ELSE chr(64 + pos) END,
    'variante', b.variante_nome
  );
END $$;

REVOKE ALL ON FUNCTION public.identidade_opcao(text) FROM public;
GRANT EXECUTE ON FUNCTION public.identidade_opcao(text) TO anon, authenticated;
