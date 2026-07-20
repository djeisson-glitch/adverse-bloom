-- Blindar as INFORMAÇÕES do cliente sem esconder o NOME.
--
-- Antes: "Authenticated read clients USING(true)" — qualquer logado lia a linha
-- inteira (e-mail, telefone, contatos, faturamento). RLS protege LINHA, não
-- coluna, então a única forma de esconder as colunas sensíveis é trancar a
-- tabela e expor um subconjunto seguro por uma view — mesmo padrão do dinheiro
-- (projects_financeiro + projects_v).
--
-- Depois:
--  • clients: leitura só pra quem tem o módulo "clientes" (ou admin).
--  • clientes_publico (view): id + nome + nome-fantasia + tipo + editor do
--    intake — o que o time precisa pra VER e ESCOLHER o cliente num projeto,
--    sem alcançar contato/faturamento. A view roda como dono (sem
--    security_invoker), então ignora a RLS do clients e serve o nome a todos.

CREATE OR REPLACE FUNCTION public.pode_ver_clientes()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module = 'clientes'
        AND up.permission IN ('view', 'edit')
    );
$$;

-- Tranca a leitura completa da tabela (linha inteira = todas as colunas).
DROP POLICY IF EXISTS "Authenticated read clients" ON public.clients;
DROP POLICY IF EXISTS "clients read gestao" ON public.clients;
CREATE POLICY "clients read gestao" ON public.clients
  FOR SELECT TO authenticated
  USING (public.pode_ver_clientes());

-- View pública: só a identidade do cliente (sem contato/faturamento).
CREATE OR REPLACE VIEW public.clientes_publico AS
  SELECT id, name, trade_name, type, intake_editor_id
  FROM public.clients;

-- Sem security_invoker (default), a view roda como dono e ignora a RLS do
-- clients — é de propósito: ela só expõe colunas não-sensíveis.
GRANT SELECT ON public.clientes_publico TO authenticated;
