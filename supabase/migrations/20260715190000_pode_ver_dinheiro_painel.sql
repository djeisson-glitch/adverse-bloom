-- =========================================================================
-- pode_ver_dinheiro: produtor deixa de ver dinheiro POR PAPEL
--
--  A conta que disparou o alerta era produtor com todos os grupos de dinheiro
--  DESLIGADOS no painel — mas via o financeiro assim mesmo, porque tanto o
--  front (canSeeMoney) quanto esta função incluíam 'produtor' no atalho por
--  papel, ignorando o painel.
--
--  "O painel manda": só admin/manager (nível admin) veem dinheiro por papel.
--  Todo o resto — inclusive produtor — depende da concessão a um módulo de
--  dinheiro. Produtor nasce semeado com tudo, então o padrão não muda; mas
--  agora dá pra tirar de verdade.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.pode_ver_dinheiro(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = _uid AND role::text IN ('admin', 'manager')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
       WHERE user_id = _uid
         AND permission <> 'none'
         AND module IN (
           'demandas','leads','orcamentos','clientes','follow_ups','propostas',
           'faturamento','fechamento','contas_fees','relatorios','financeiro','fornecedores'
         )
    );
$$;
GRANT EXECUTE ON FUNCTION public.pode_ver_dinheiro(uuid) TO authenticated;
