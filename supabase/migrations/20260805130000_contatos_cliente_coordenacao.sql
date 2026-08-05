-- =========================================================================
-- Coordenação cadastra contato do cliente — sem ganhar a ficha do cliente
--
-- O seletor de "solicitado por" lê e escreve `clients.intake_contatos`. Mas
-- a RLS de `clients` exige admin, manager ou permissão no módulo `clientes`,
-- e a coordenação não tem — então pra ela o seletor abria vazio e o cadastro
-- falhava.
--
-- A saída ÓBVIA seria dar `clientes: view` pra ela. É a errada: a ficha do
-- cliente carrega modelo de cobrança, valor-hora e tabela de preço junto.
-- Resolver "cadastrar um contato" abrindo o cadastro comercial inteiro é o
-- mesmo erro que já custou caro aqui — `pode_ver_dinheiro` liberava o
-- financeiro pra quem tinha "demandas: view".
--
-- Então: duas funções que tocam SÓ a coluna dos contatos. Quem coordena
-- ganha exatamente o que precisa e nada além.
-- =========================================================================

/**
 * Quem administra os contatos de um cliente.
 *
 * Produção inteira: quem trabalha com demanda, projeto ou peça precisa
 * registrar quem pediu o quê. Nada aqui é dinheiro.
 */
CREATE OR REPLACE FUNCTION public.pode_gerir_contatos()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.permission IN ('view', 'edit')
        AND up.module IN ('clientes', 'demandas', 'projetos', 'pos_producao')
    );
$$;
GRANT EXECUTE ON FUNCTION public.pode_gerir_contatos() TO authenticated;

/** A lista de contatos daquele cliente — só ela, sem o resto da ficha. */
CREATE OR REPLACE FUNCTION public.contatos_do_cliente(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lista jsonb;
BEGIN
  IF NOT public.pode_gerir_contatos() THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT COALESCE(intake_contatos, '[]'::jsonb) INTO lista
    FROM public.clients WHERE id = _client_id;
  RETURN COALESCE(lista, '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.contatos_do_cliente(uuid) TO authenticated;

/**
 * Acrescenta um contato. Devolve a lista nova.
 *
 * Nome repetido não entra duas vezes: o mesmo nome já é a chave que liga a
 * peça ao solicitante, e duplicata aqui vira duas opções idênticas no
 * seletor — exatamente a confusão que o seletor veio resolver.
 */
CREATE OR REPLACE FUNCTION public.cliente_adicionar_contato(
  _client_id uuid, _nome text, _email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lista jsonb;
  nome  text := btrim(_nome);
BEGIN
  IF NOT public.pode_gerir_contatos() THEN
    RAISE EXCEPTION 'Sem permissão para cadastrar contato';
  END IF;
  IF nome = '' OR nome IS NULL THEN
    RAISE EXCEPTION 'Informe o nome';
  END IF;

  SELECT COALESCE(intake_contatos, '[]'::jsonb) INTO lista
    FROM public.clients WHERE id = _client_id FOR UPDATE;
  IF lista IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(lista) c WHERE btrim(c->>'nome') = nome) THEN
    RETURN lista;   -- já está lá: devolve como está, sem duplicar
  END IF;

  lista := lista || jsonb_build_object(
    'nome', nome,
    'email', nullif(btrim(coalesce(_email, '')), '')
  );

  UPDATE public.clients SET intake_contatos = lista WHERE id = _client_id;
  RETURN lista;
END $$;
GRANT EXECUTE ON FUNCTION public.cliente_adicionar_contato(uuid, text, text) TO authenticated;
