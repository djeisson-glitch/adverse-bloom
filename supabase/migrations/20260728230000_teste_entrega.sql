-- =========================================================================
-- Teste de entrega: transformar "às vezes não chega" em algo verificável.
--
-- O caminho do servidor está OK (medido: zero avisos presos, todos os de
-- nível 1 e 2 saíram). O que falha é do "push enviado" pra frente — navegador
-- fechado, macOS bloqueando o Chrome, Foco ligado. Nada disso dá pra ver do
-- servidor, e por isso a reclamação nunca virava causa.
--
-- Com isto cada pessoa dispara um aviso REAL pelo mesmo caminho dos outros e
-- vê em 10 segundos se chegou. Se não chegar, o problema está na máquina dela
-- — e aí a gente conserta o certo em vez de trocar de canal no escuro.
-- =========================================================================

INSERT INTO public.notificacao_tipos (tipo, rotulo, descricao, grupo, nivel_padrao, ordem)
VALUES ('teste_entrega', 'Teste de entrega', 'Aviso de teste disparado pela própria pessoa', 'sistema', 1, 99)
ON CONFLICT (tipo) DO UPDATE SET nivel_padrao = 1, rotulo = EXCLUDED.rotulo;

CREATE OR REPLACE FUNCTION public.testar_entrega_push()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid; _tem int;
BEGIN
  _u := auth.uid();
  IF _u IS NULL THEN RETURN jsonb_build_object('erro', 'sem sessão'); END IF;

  SELECT COUNT(*) INTO _tem FROM public.push_subscriptions WHERE user_id = _u;
  IF _tem = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem assinatura no servidor');
  END IF;

  -- dedupe_key com o instante: dois testes seguidos não se anulam
  PERFORM public.notificar(
    _u, 'teste_entrega', 'critico',
    'Teste de entrega ✅',
    'Se você está lendo isto na área de trabalho, o canal está funcionando.',
    '/notificacoes',
    'teste:' || _u::text || ':' || extract(epoch from now())::bigint::text);

  RETURN jsonb_build_object('ok', true, 'dispositivos', _tem);
END $$;

GRANT EXECUTE ON FUNCTION public.testar_entrega_push() TO authenticated;
