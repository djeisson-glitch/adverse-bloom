-- Conserto de um bug que a própria sonda pegou antes de ir pro ar.
--
-- `IF b.id IS NULL` estoura com "record b is not assigned yet" quando o
-- registro nunca foi atribuído — e era exatamente o que acontecia com token
-- NÃO-uuid, ou seja, com /proposta/:token (proposal_letters.token é text).
-- A página nova quebraria na primeira visita do cliente.
--
-- Passa a usar uma flag explícita em vez de sondar um registro que pode não
-- existir. Mesmo comportamento externo; só deixa de estourar.

CREATE OR REPLACE FUNCTION public.identidade_opcao(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b     record;
  achou boolean := false;
  pos   int;
  qtd   int;
  num   text;
  _uuid uuid;
BEGIN
  IF _token IS NULL OR _token = '' THEN RETURN NULL; END IF;

  -- Converte só se for uuid de verdade: um token de proposal_letters é texto
  -- livre e o cast direto estouraria em vez de devolver "token inválido".
  _uuid := CASE WHEN _token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN _token::uuid END;

  IF _uuid IS NOT NULL THEN
    SELECT * INTO b FROM public.budgets WHERE public_token = _uuid LIMIT 1;
    achou := FOUND;

    IF NOT achou THEN
      SELECT bb.* INTO b
        FROM public.budget_shares s
        JOIN public.budgets bb ON bb.id = s.budget_id
       WHERE s.token = _uuid
         AND s.revogado_em IS NULL
         AND (s.expira_em IS NULL OR s.expira_em >= now())
       LIMIT 1;
      achou := FOUND;
    END IF;
  END IF;

  IF NOT achou THEN
    SELECT bb.* INTO b
      FROM public.proposal_letters pl
      JOIN public.budgets bb ON bb.id = pl.budget_id
     WHERE pl.token = _token
     LIMIT 1;
    achou := FOUND;
  END IF;

  IF NOT achou THEN
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
    'letra',    CASE WHEN qtd < 2 THEN '' ELSE chr(64 + pos) END,
    'variante', b.variante_nome
  );
END $$;
