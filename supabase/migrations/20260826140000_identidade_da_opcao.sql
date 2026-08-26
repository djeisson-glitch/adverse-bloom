-- Nome único da proposta TAMBÉM nas páginas públicas.
--
-- Djêisson (26/08): "preciso que as propostas tenham nomes únicos em todos os
-- lugares e exportações". Nas telas internas isso já foi resolvido; faltavam
-- as duas páginas PÚBLICAS — justamente as que o cliente abre e salva:
--   /carta/:token        (carta_publica)
--   /orcamento/:token    (orcamento_compartilhado)
-- Nenhuma das duas devolve o que identifica a opção, então o Ctrl+P do
-- cliente gerava arquivos de nome idêntico para propostas diferentes.
--
-- POR QUE UMA FUNÇÃO NOVA, e não um campo a mais nas que já existem:
-- carta_publica tem ~80 linhas e orcamento_compartilhado ~200, com toda a
-- regra de o-que-o-cliente-pode-ver. Um CREATE OR REPLACE nelas obrigaria a
-- reescrever tudo a partir da definição vigente, e foi assim que uma correção
-- anterior apagou o que tinha vindo depois. Acrescentar é seguro; reescrever
-- não é.
--
-- Só devolve identificação: número, letra e nome da opção. Nada de valor.

CREATE OR REPLACE FUNCTION public.identidade_opcao(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b   record;
  pos int;
  qtd int;
  num text;
BEGIN
  -- Aceita os dois tokens públicos que existem hoje: o da carta (no próprio
  -- orçamento) e o do compartilhamento interno (budget_shares).
  SELECT * INTO b FROM public.budgets WHERE public_token = _token LIMIT 1;
  IF NOT FOUND THEN
    SELECT bb.* INTO b
      FROM public.budget_shares s
      JOIN public.budgets bb ON bb.id = s.budget_id
     WHERE s.token = _token
       AND s.revogado_em IS NULL
       AND (s.expira_em IS NULL OR s.expira_em >= now())
     LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    RETURN NULL;   -- token inválido: quem chama já trata isso
  END IF;

  SELECT d.numero INTO num FROM public.deals d WHERE d.id = b.deal_id;

  -- MESMA REGRA de src/lib/orcamentoDaCarta.ts → letraDaOpcao().
  -- Se mexer aqui, mexa lá: as duas existem porque a página pública só tem um
  -- orçamento em mãos e não consegue calcular a ordem sozinha.
  -- Ordem de criação; a principal nasce primeiro e é sempre A. Versão antiga
  -- (is_latest_version = false) não ocupa letra.
  SELECT count(*), count(*) FILTER (WHERE o.created_at < b.created_at) + 1
    INTO qtd, pos
    FROM public.budgets o
   WHERE o.deal_id = b.deal_id
     AND o.is_latest_version IS NOT FALSE;

  RETURN jsonb_build_object(
    'numero',   num,
    -- Letra só quando existe mais de uma opção: num negócio com proposta
    -- única, "[0329A]" seria ruído sem informação.
    'letra',    CASE WHEN qtd < 2 THEN '' ELSE chr(64 + pos) END,
    'variante', b.variante_nome
  );
END $$;

REVOKE ALL ON FUNCTION public.identidade_opcao(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.identidade_opcao(uuid) TO anon, authenticated;
