-- =========================================================================
-- Onda 6C · Portal do cliente — aprovação do cliente no fluxo de 2 níveis.
-- O cliente aprova (marca aprovado_cliente_*) ou pede ajuste (cria alteração,
-- via portal_deliverable_alteracao criada na 6A).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.portal_deliverable_aprovar(
  _token text,
  _deliverable_id uuid,
  _aprovador text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid uuid;
  d_client_id uuid;
BEGIN
  SELECT client_id INTO cid
    FROM public.client_portal_tokens
    WHERE token = _token AND ativo = true
      AND (expires_at IS NULL OR expires_at > now());
  IF cid IS NULL THEN
    RETURN jsonb_build_object('error', 'token inválido ou expirado');
  END IF;

  SELECT p.client_id INTO d_client_id
    FROM public.deliverables d JOIN public.projects p ON p.id = d.project_id
    WHERE d.id = _deliverable_id;
  IF d_client_id IS NULL OR d_client_id <> cid THEN
    RETURN jsonb_build_object('error', 'entregável não pertence ao cliente');
  END IF;

  UPDATE public.deliverables
    SET aprovado_cliente_em = now(),
        aprovado_cliente_por = COALESCE(_aprovador, 'cliente'),
        status = 'aprovado',
        updated_at = now()
    WHERE id = _deliverable_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_deliverable_aprovar(text, uuid, text) TO anon;
