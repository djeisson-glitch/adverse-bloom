-- =========================================================================
-- Remover contato cadastrado por engano
--
-- O seletor deixava cadastrar e não deixava tirar. Nome digitado errado, ou
-- pessoa que saiu da empresa do cliente, ficava pra sempre na lista — e essa
-- lista também alimenta o formulário público /solicitar, então o erro
-- aparece pro cliente.
--
-- Remover NÃO mexe nas peças que já apontam pra esse nome: `solicitado_por` é
-- texto, e apagar o histórico de quem pediu o quê seria pior que um nome a
-- mais na lista.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.cliente_remover_contato(_client_id uuid, _nome text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lista jsonb;
BEGIN
  IF NOT public.pode_gerir_contatos() THEN
    RAISE EXCEPTION 'Sem permissão para remover contato';
  END IF;

  SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) INTO lista
    FROM public.clients cl,
         LATERAL jsonb_array_elements(COALESCE(cl.intake_contatos, '[]'::jsonb)) c
   WHERE cl.id = _client_id
     AND btrim(c->>'nome') <> btrim(_nome);

  UPDATE public.clients SET intake_contatos = COALESCE(lista, '[]'::jsonb)
   WHERE id = _client_id;
  RETURN COALESCE(lista, '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.cliente_remover_contato(uuid, text) TO authenticated;
