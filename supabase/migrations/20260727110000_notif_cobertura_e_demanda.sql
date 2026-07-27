-- =========================================================================
-- Duas correções depois do "notificações não estão funcionando".
--
-- O diagnóstico contra o banco: o encanamento funciona (permissão concedida,
-- assinatura do navegador batendo com a do banco, push_em carimbado 2s depois
-- da criação). Mas:
--
--   1) 4 das 5 pessoas do time NÃO TÊM navegador registrado. Pra elas o
--      sistema nunca entregou nada — e o painel de notificações mostrava as
--      preferências delas como se estivesse tudo certo. Parecer configurado
--      sem entregar é pior que estar visivelmente quebrado.
--
--   2) `demanda_nova` estava em nível 2 (espera o resumo das 9/14/17h). Foi
--      classificação minha e está errada na prática: demanda nova é trabalho
--      entrando pela porta, não pode ficar meio dia em silêncio. Vai pra
--      nível 1.
-- =========================================================================

-- ---- 1) Demanda nova interrompe na hora --------------------------------
UPDATE public.notificacao_tipos
   SET nivel_padrao = 1,
       descricao = 'Chegou demanda pelo formulário público — trabalho entrando'
 WHERE tipo = 'demanda_nova';

-- Reclassifica as que ainda não saíram, senão a que está pendente continua
-- esperando o resumo com a regra velha.
UPDATE public.notificacoes
   SET nivel = 1
 WHERE tipo = 'demanda_nova' AND push_em IS NULL;

-- ---- 2) Quem realmente recebe push -------------------------------------
/**
 * Cobertura de push por pessoa, pra gestão.
 *
 * push_subscriptions tem RLS "cada um só vê a sua" — então o admin NÃO
 * conseguia saber quem estava sem receber. Esta função (SECURITY DEFINER)
 * devolve só o CONTADOR por pessoa: quem tem quantos navegadores. Não expõe
 * endpoint nem chave, que é o que precisa continuar privado.
 */
CREATE OR REPLACE FUNCTION public.notif_cobertura_push()
RETURNS TABLE (user_id uuid, nome text, navegadores int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         COALESCE(p.full_name, p.email),
         COUNT(s.id)::int
    FROM public.profiles p
    LEFT JOIN public.push_subscriptions s ON s.user_id = p.id
   WHERE COALESCE(p.ativo, true)
     AND public.pode_admin_notif(auth.uid())
   GROUP BY p.id, p.full_name, p.email
   ORDER BY COUNT(s.id), COALESCE(p.full_name, p.email);
$$;

GRANT EXECUTE ON FUNCTION public.notif_cobertura_push() TO authenticated;
