-- =====================================================================
-- BUG GRAVE: a coordenadora não conseguia salvar NADA em entregáveis
-- (status, responsável, prazos...). As políticas de mutação de deliverables
-- e deliverable_alteracoes exigiam can_apontar_horas(), que lista
-- admin/manager/produtor/operator/equipe/edicao — SEM coordenadora. Como
-- RLS que reprova no USING faz o UPDATE afetar 0 linhas SEM erro, a mudança
-- "sumia no refresh" silenciosamente.
--
-- Correção: um helper "é do time" = tem qualquer papel que não seja cliente.
-- Assim já cobre coordenadora E qualquer papel novo no futuro (o enum cresceu
-- e a lista fixa não acompanhou — foi essa a origem do bug).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.pode_editar_producao(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text <> 'cliente'
  )
$$;
GRANT EXECUTE ON FUNCTION public.pode_editar_producao(uuid) TO authenticated;

-- deliverables: muta quem é do time (não cliente)
DROP POLICY IF EXISTS "deliverables mutations equipe" ON public.deliverables;
CREATE POLICY "deliverables mutations equipe" ON public.deliverables
  FOR ALL TO authenticated
  USING (public.pode_editar_producao(auth.uid()))
  WITH CHECK (public.pode_editar_producao(auth.uid()));

-- deliverable_alteracoes: idem (a coordenadora registra alteração do cliente)
DROP POLICY IF EXISTS "alteracoes mutations" ON public.deliverable_alteracoes;
CREATE POLICY "alteracoes mutations" ON public.deliverable_alteracoes
  FOR ALL TO authenticated
  USING (public.pode_editar_producao(auth.uid()))
  WITH CHECK (public.pode_editar_producao(auth.uid()));
