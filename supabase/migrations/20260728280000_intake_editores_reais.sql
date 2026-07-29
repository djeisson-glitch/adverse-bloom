-- A capacidade contava a conta genérica da produtora como editor.
--
-- adverseprodutora@gmail.com tem papel 'edicao' — o que faz sentido pra
-- permissão, mas ela não é uma PESSOA que edita. Contando ela, a capacidade
-- virava 3 em vez de 2 e todo prazo saía um terço mais curto do que o time
-- consegue entregar.
--
-- Capacidade agora conta só quem tem trabalho de verdade no sistema: já foi
-- responsável por algum entregável ou já lançou hora. Um editor novo não
-- conta no primeiro dia — e isso erra pro lado seguro (prazo mais longo),
-- que é o lado certo de errar quando se está prometendo pro cliente.
CREATE OR REPLACE FUNCTION public.intake_editores_ativos()
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(COUNT(DISTINCT p.id), 1)::int
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
   WHERE coalesce(p.ativo, true)
     AND ur.role::text = 'edicao'
     AND (
       EXISTS (SELECT 1 FROM public.deliverables d WHERE d.responsavel_id = p.id)
       OR EXISTS (SELECT 1 FROM public.time_entries t WHERE t.user_id = p.id)
     )
$$;

COMMENT ON FUNCTION public.intake_editores_ativos() IS
  'Editores que de fato editam (já pegaram entregável ou lançaram hora). Denominador da espera quando o cliente não tem editor fixo — contas genéricas não entram.';

GRANT EXECUTE ON FUNCTION public.intake_editores_ativos() TO anon, authenticated;
