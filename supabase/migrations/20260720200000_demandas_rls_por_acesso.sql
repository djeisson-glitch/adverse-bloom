-- Demandas não aparecem pra coordenadora — a trava estava no BANCO, não na tela.
--
-- A tabela demandas estava com RLS `USING pode_ver_dinheiro()`. Quando o módulo
-- "demandas" saiu da lista de módulos de dinheiro (pra coordenadora poder ver
-- demandas SEM ver dinheiro), quem só tem esse módulo passou a dar falso em
-- pode_ver_dinheiro() — então a pessoa entra na tela (o painel libera) e recebe
-- zero linha. Contradição entre as duas regras.
--
-- Corrige seguindo o princípio "o painel manda": quem lê demandas é quem tem o
-- módulo demandas concedido (ou admin), e ponto.

CREATE OR REPLACE FUNCTION public.pode_ver_demandas(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = _uid AND role::text IN ('admin', 'manager')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
       WHERE user_id = _uid
         AND module = 'demandas'
         AND permission <> 'none'
    );
$$;

GRANT EXECUTE ON FUNCTION public.pode_ver_demandas(uuid) TO authenticated;

DROP POLICY IF EXISTS "gestao_demandas" ON public.demandas;
DROP POLICY IF EXISTS "demandas por acesso" ON public.demandas;
CREATE POLICY "demandas por acesso" ON public.demandas
  FOR ALL TO authenticated
  USING (public.pode_ver_demandas())
  WITH CHECK (public.pode_ver_demandas());
