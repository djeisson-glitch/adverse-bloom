-- Teste de ponta a ponta: a pessoa dispara uma notificação pra si mesma e
-- confere se o balão de desktop aparece. Prioridade "critico" pra também
-- entrar no push (aba fechada). É o botão que transforma "não funciona" em
-- diagnóstico de um clique.
CREATE OR REPLACE FUNCTION public.notificar_teste()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sem sessão';
  END IF;
  -- dedupe_key com o minuto pra dar pra testar de novo logo em seguida, mas
  -- sem virar 10 balões se clicar rápido.
  PERFORM public.notificar(
    auth.uid(), 'teste', 'critico',
    'Notificação de teste ✅',
    'Se você está vendo isto, as notificações estão funcionando.',
    '/notificacoes',
    'teste:' || auth.uid()::text || ':' || to_char(now(), 'YYYYMMDDHH24MI')
  );
END $$;

GRANT EXECUTE ON FUNCTION public.notificar_teste() TO authenticated;
