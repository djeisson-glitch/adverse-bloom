-- Separa "esta PESSOA pode excluir" de "este REGISTRO pode ser excluído".
--
-- Estavam juntos e a checagem de permissão vinha primeiro, então as regras de
-- negócio nunca eram exercitadas em teste: qualquer sonda (que roda sem
-- usuário logado) parava em "você não tem acesso" e as quatro travas que
-- realmente importam ficavam sem prova.

/** Só as regras do REGISTRO. Sem permissão — quem chama decide isso. */
CREATE OR REPLACE FUNCTION public.bloqueio_da_opcao(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b      record;
  filhas int;
  irmas  int;
  job    text;
  avisos text[] := '{}';
BEGIN
  SELECT * INTO b FROM public.budgets WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('pode', false, 'motivo', 'Opção não encontrada.');
  END IF;

  -- Documento que o cliente aceitou não se apaga: é prova de acordo.
  IF b.aprovada_em IS NOT NULL THEN
    RETURN jsonb_build_object('pode', false,
      'motivo', 'Esta opção foi aprovada pelo cliente. Documento aprovado não é excluído.');
  END IF;

  -- projects.budget_id é ON DELETE SET NULL: sem esta trava, o Job perderia o
  -- orçamento em silêncio.
  SELECT numero INTO job FROM public.projects WHERE budget_id = _id LIMIT 1;
  IF job IS NOT NULL THEN
    RETURN jsonb_build_object('pode', false,
      'motivo', format('Esta opção virou o Job %s. Excluir deixaria o projeto sem orçamento.', job));
  END IF;

  -- budgets.parent_budget_id também é SET NULL: apagar a Principal deixaria as
  -- variantes órfãs, e órfã se comporta como principal em todo o sistema.
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

  -- Dá pra excluir. O que vai junto tem que estar na tela ANTES do clique.
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

  RETURN jsonb_build_object('pode', true,
    'nome', coalesce(b.variante_nome, 'Principal'), 'avisos', to_jsonb(avisos));
END $$;

CREATE OR REPLACE FUNCTION public.pode_excluir_opcao(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.pode_ver_dinheiro() THEN
    RETURN jsonb_build_object('pode', false, 'motivo', 'Você não tem acesso a orçamentos.');
  END IF;
  RETURN public.bloqueio_da_opcao(_id);
END $$;

REVOKE ALL ON FUNCTION public.bloqueio_da_opcao(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.bloqueio_da_opcao(uuid) TO authenticated;
