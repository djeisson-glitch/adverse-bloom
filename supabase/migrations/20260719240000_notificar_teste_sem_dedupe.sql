-- Teste sem dedupe: antes a chave incluía o minuto, então testar duas vezes
-- no mesmo minuto não criava nada (parecia que "parou de funcionar"). Agora
-- cada clique gera uma notificação de verdade.
CREATE OR REPLACE FUNCTION public.notificar_teste()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sem sessão';
  END IF;
  PERFORM public.notificar(
    auth.uid(), 'teste', 'critico',
    'Notificação de teste ✅',
    'Se você está vendo isto, as notificações estão funcionando.',
    '/notificacoes',
    NULL   -- sem dedupe: cada teste dispara
  );
END $$;

GRANT EXECUTE ON FUNCTION public.notificar_teste() TO authenticated;
