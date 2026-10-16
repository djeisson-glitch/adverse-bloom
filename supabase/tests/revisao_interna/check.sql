DO $$
DECLARE d deliverables; rodada text; quantidade int;
BEGIN
  SELECT * INTO STRICT d FROM deliverables WHERE titulo = 'Legado';
  IF d.status <> 'revisao_n1' OR d.rev_n1_ajuste OR d.aprovado_n1_em IS NULL THEN
    RAISE EXCEPTION 'Migração deve unificar a fila, zerar ajuste e preservar histórico';
  END IF;
  IF (SELECT count(*) FROM notificacoes WHERE tipo='aguardando_aprovacao') <> 1 THEN
    RAISE EXCEPTION 'Legado deve receber aviso ao entrar na fila única';
  END IF;
  IF (SELECT status FROM deliverables WHERE titulo='Cliente') <> 'com_cliente' THEN
    RAISE EXCEPTION 'Migração não pode mudar peças fora da revisão';
  END IF;

  -- Primeira ida, ajustes repetidos, versões antigas e correção administrativa.
  -- Todas acontecem na mesma transação, com updated_at idêntico de propósito.
  FOREACH rodada IN ARRAY ARRAY['revisao_n1','revisao','revisao_n2','revisao_n1'] LOOP
    UPDATE deliverables SET status=rodada WHERE titulo='Edição';
    SELECT * INTO STRICT d FROM deliverables WHERE titulo='Edição';
    IF d.status <> 'revisao_n1' OR d.rev_n1_ajuste OR d.rev_n2_ajuste OR d.rev_ajuste_pendente THEN
      RAISE EXCEPTION 'Reenvio deve entrar na mesma fila sem flags antigas';
    END IF;
    IF (SELECT count(*) FROM notificacoes WHERE link LIKE '%' || d.id AND tipo='aguardando_aprovacao' AND lida_em IS NULL) <> 1 THEN
      RAISE EXCEPTION 'Cada rodada deve ter exatamente um aviso ativo';
    END IF;
    SELECT count(*) INTO quantidade FROM notificacoes;
    UPDATE deliverables SET status=rodada, updated_at=updated_at WHERE id=d.id;
    UPDATE deliverables SET titulo=titulo WHERE id=d.id;
    IF (SELECT count(*) FROM notificacoes) <> quantidade THEN
      RAISE EXCEPTION 'Salvar sem transição não pode repetir o aviso';
    END IF;
    UPDATE deliverables SET status='ajuste_interno', retrabalho=true,
      rev_n1_ajuste=true, aprovado_n1_em=now() WHERE id=d.id;
    IF EXISTS(SELECT 1 FROM notificacoes WHERE link LIKE '%' || d.id AND tipo='aguardando_aprovacao' AND lida_em IS NULL) THEN
      RAISE EXCEPTION 'Sair da revisão deve resolver o aviso anterior';
    END IF;
    UPDATE deliverables SET status='em_edicao' WHERE id=d.id;
  END LOOP;
  IF (SELECT count(*) FROM notificacoes WHERE tipo='aguardando_aprovacao') <> 5 THEN
    RAISE EXCEPTION 'Um legado e quatro rodadas devem gerar cinco avisos';
  END IF;
  IF EXISTS(SELECT 1 FROM notificacoes WHERE tipo='aguardando_aprovacao' AND user_id <> '00000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Todas as revisões devem ir à mesma aprovadora';
  END IF;
  IF (SELECT count(*) FROM notificacoes WHERE titulo='Refeito — esperando seu ok') <> 3 THEN
    RAISE EXCEPTION 'Reenvios devem ser identificados';
  END IF;
  RAISE NOTICE 'OK: legado, primeira ida, 3 reenvios, destinatário, aviso por rodada, resolução e sem duplicação';
END $$;
