-- Excluir UMA opção do orçamento, sem levar o resto junto.
--
-- Djêisson (26/08): "preciso que tenha a opção de excluir separadamente cada
-- versão do orçamento".
--
-- Não pode ser um DELETE solto da tela. O mapa de chaves estrangeiras de
-- budgets tem duas armadilhas silenciosas:
--
--   projects.budget_id       ON DELETE SET NULL  -> o Job perde o vínculo com
--                                                   o orçamento e ninguém vê
--   budgets.parent_budget_id ON DELETE SET NULL  -> apagar a Principal deixa
--                                                   as variantes órfãs, e órfã
--                                                   passa a se comportar como
--                                                   principal em todo lugar
--
-- E mais: budget_shares e proposal_letters caem em CASCATA, ou seja, o link
-- que o cliente já tem em mãos morre sem aviso.
--
-- Por isso a decisão mora aqui, e não na tela: PostgREST devolve 204 mesmo
-- quando a RLS barra, então uma checagem no navegador daria "excluído" para
-- uma exclusão que não aconteceu.

/**
 * Diz se dá pra excluir, e o que se perde junto. A tela chama isto ANTES de
 * perguntar, pra avisar em vez de descobrir depois.
 */
CREATE OR REPLACE FUNCTION public.pode_excluir_opcao(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b        record;
  filhas   int;
  irmas    int;
  job      text;
  avisos   text[] := '{}';
BEGIN
  IF NOT public.pode_ver_dinheiro() THEN
    RETURN jsonb_build_object('pode', false, 'motivo', 'Você não tem acesso a orçamentos.');
  END IF;

  SELECT * INTO b FROM public.budgets WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('pode', false, 'motivo', 'Opção não encontrada.');
  END IF;

  -- Documento que o cliente aceitou não se apaga. É prova de acordo.
  IF b.aprovada_em IS NOT NULL THEN
    RETURN jsonb_build_object('pode', false,
      'motivo', 'Esta opção foi aprovada pelo cliente. Documento aprovado não é excluído.');
  END IF;

  SELECT numero INTO job FROM public.projects WHERE budget_id = _id LIMIT 1;
  IF job IS NOT NULL THEN
    RETURN jsonb_build_object('pode', false,
      'motivo', format('Esta opção virou o Job %s. Excluir deixaria o projeto sem orçamento.', job));
  END IF;

  SELECT count(*) INTO filhas FROM public.budgets
   WHERE parent_budget_id = _id AND is_latest_version IS NOT FALSE;
  IF b.parent_budget_id IS NULL AND filhas > 0 THEN
    RETURN jsonb_build_object('pode', false,
      'motivo', format('Esta é a Principal e existem %s outra(s) opção(ões) ligadas a ela. Exclua as outras primeiro.', filhas));
  END IF;

  SELECT count(*) INTO irmas FROM public.budgets
   WHERE deal_id = b.deal_id AND is_latest_version IS NOT FALSE;
  IF irmas <= 1 THEN
    RETURN jsonb_build_object('pode', false,
      'motivo', 'É a única opção deste orçamento. Para descartar tudo, exclua o negócio.');
  END IF;

  -- Daqui pra baixo dá, mas o que se perde junto tem que estar na tela ANTES
  -- do clique — não depois.
  IF b.public_token IS NOT NULL THEN
    avisos := avisos || 'O link público desta opção para de funcionar para quem já recebeu.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.budget_shares WHERE budget_id = _id AND revogado_em IS NULL) THEN
    avisos := avisos || 'Links de compartilhamento interno desta opção param de funcionar.';
  END IF;
  IF (SELECT count(*) FROM public.budget_items WHERE budget_id = _id) > 0 THEN
    avisos := avisos || format('%s linhas da planilha vão junto.',
                        (SELECT count(*) FROM public.budget_items WHERE budget_id = _id));
  END IF;

  RETURN jsonb_build_object(
    'pode', true,
    'nome', coalesce(b.variante_nome, 'Principal'),
    'avisos', to_jsonb(avisos));
END $$;

/**
 * Executa. Repete TODAS as checagens: a tela pode estar desatualizada, e
 * confiar nela para uma exclusão é como não ter checagem nenhuma.
 */
CREATE OR REPLACE FUNCTION public.excluir_opcao_orcamento(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  veredito jsonb;
  nome     text;
BEGIN
  veredito := public.pode_excluir_opcao(_id);
  IF NOT (veredito->>'pode')::boolean THEN
    RAISE EXCEPTION '%', veredito->>'motivo';
  END IF;

  SELECT coalesce(variante_nome, 'Principal') INTO nome FROM public.budgets WHERE id = _id;
  DELETE FROM public.budgets WHERE id = _id;

  RETURN jsonb_build_object('ok', true, 'nome', nome);
END $$;

REVOKE ALL ON FUNCTION public.pode_excluir_opcao(uuid) FROM public;
REVOKE ALL ON FUNCTION public.excluir_opcao_orcamento(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pode_excluir_opcao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_opcao_orcamento(uuid) TO authenticated;
