BEGIN;
ALTER TABLE public.client_contratos ADD COLUMN modelo_faturamento_anterior text
  NOT NULL DEFAULT 'nenhum' CHECK (modelo_faturamento_anterior IN ('nenhum','horas','tabela'));
COMMENT ON COLUMN public.client_contratos.modelo_faturamento_anterior IS
  'Modelo retomado ao desativar o contrato; contratos anteriores à função usam nenhum, sem presumir tabela ou horas.';

CREATE OR REPLACE FUNCTION public.definir_contrato_ativo(_contrato uuid, _ativo boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE c public.client_contratos; cliente uuid; modelo_atual text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_ver_dinheiro() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF _ativo IS NULL THEN RAISE EXCEPTION 'Informe se o contrato está ativo'; END IF;
  SELECT client_id INTO cliente FROM public.client_contratos WHERE id=_contrato;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  -- A mesma trava usada por salvar_contrato_cliente serializa salvar/ativar/desativar.
  PERFORM 1 FROM public.clients WHERE id=cliente FOR UPDATE;
  SELECT * INTO c FROM public.client_contratos WHERE id=_contrato FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  IF c.ativo = _ativo THEN RETURN c.id; END IF;
  SELECT modelo INTO modelo_atual FROM public.client_faturamento WHERE client_id=cliente;
  IF _ativo THEN
    IF EXISTS (SELECT 1 FROM public.client_contratos WHERE client_id=cliente AND ativo AND id<>c.id) THEN
      RAISE EXCEPTION 'Este cliente já tem outro contrato ativo';
    END IF;
    IF c.inicio IS NULL OR nullif(trim(c.nome),'') IS NULL THEN
      RAISE EXCEPTION 'Revise o nome e o início do contrato antes de ativar';
    END IF;
    UPDATE public.client_contratos SET ativo=true,
      modelo_faturamento_anterior=CASE WHEN modelo_atual IN ('horas','tabela','nenhum')
        THEN modelo_atual ELSE modelo_faturamento_anterior END WHERE id=c.id;
    INSERT INTO public.client_faturamento(client_id,modelo) VALUES(cliente,'contrato')
      ON CONFLICT(client_id) DO UPDATE SET modelo='contrato';
  ELSE
    UPDATE public.client_contratos SET ativo=false WHERE id=c.id;
    -- Não sobrescrever um modelo escolhido por fora nem retirar outro contrato ativo.
    IF NOT EXISTS (SELECT 1 FROM public.client_contratos WHERE client_id=cliente AND ativo) THEN
      UPDATE public.client_faturamento SET modelo=c.modelo_faturamento_anterior
        WHERE client_id=cliente AND modelo='contrato';
    END IF;
  END IF;
  RETURN c.id;
END;
$$;
REVOKE ALL ON FUNCTION public.definir_contrato_ativo(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_contrato_ativo(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.salvar_contrato_cliente(_client uuid, _dados jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE cid uuid; modelo_anterior text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_ver_dinheiro() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  PERFORM 1 FROM public.clients WHERE id = _client FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
  IF nullif(trim(_dados->>'nome'),'') IS NULL OR nullif(_dados->>'inicio','') IS NULL
    OR coalesce((_dados->>'valor_mensal')::numeric,-1) < 0
    OR coalesce((_dados->>'diarias_mes')::numeric,-1) < 0
    OR coalesce((_dados->>'entregas_mes')::int,-1) < 0
    OR coalesce((_dados->>'acumulo_meses')::int,0) NOT BETWEEN 1 AND 60
    OR nullif(_dados->>'fim','')::date < (_dados->>'inicio')::date
  THEN RAISE EXCEPTION 'Revise nome, vigência e franquias do contrato'; END IF;
  IF (_dados ? 'validade_creditos_dias' AND nullif(_dados->>'validade_creditos_dias','')::int NOT BETWEEN 1 AND 3660)
    OR (_dados ? 'limite_diarias_acumuladas' AND nullif(_dados->>'limite_diarias_acumuladas','')::numeric < 0)
    OR (_dados ? 'limite_entregas_acumuladas' AND nullif(_dados->>'limite_entregas_acumuladas','')::numeric < 0)
    OR (_dados ? 'franquia_entregas_tipo' AND coalesce(_dados->>'franquia_entregas_tipo','') NOT IN ('todos','video','video_foto'))
  THEN RAISE EXCEPTION 'Revise validade, limites e tipo da franquia'; END IF;
  IF nullif(_dados->>'documento_path','') IS NOT NULL AND
    split_part(_dados->>'documento_path','/',1) <> _client::text THEN RAISE EXCEPTION 'Documento de outro cliente'; END IF;
  SELECT id INTO cid FROM public.client_contratos WHERE client_id=_client ORDER BY ativo DESC, created_at DESC LIMIT 1;
  IF cid IS NULL THEN
    SELECT modelo INTO modelo_anterior FROM public.client_faturamento WHERE client_id=_client;
    INSERT INTO public.client_contratos(client_id, modelo_faturamento_anterior)
      VALUES (_client, CASE WHEN modelo_anterior IN ('horas','tabela') THEN modelo_anterior ELSE 'nenhum' END)
      RETURNING id INTO cid;
  END IF;
  UPDATE public.client_contratos SET
    nome=trim(_dados->>'nome'), inicio=(_dados->>'inicio')::date, fim=nullif(_dados->>'fim','')::date,
    valor_mensal=(_dados->>'valor_mensal')::numeric, diarias_mes=(_dados->>'diarias_mes')::numeric,
    entregas_mes=(_dados->>'entregas_mes')::int, acumulo_meses=(_dados->>'acumulo_meses')::int,
    observacoes=_dados->>'observacoes', escopo_entregas=_dados->>'escopo_entregas',
    documento_path=_dados->>'documento_path', documento_nome=_dados->>'documento_nome',
    validade_creditos_dias=CASE WHEN _dados ? 'validade_creditos_dias' THEN nullif(_dados->>'validade_creditos_dias','')::int ELSE validade_creditos_dias END,
    limite_diarias_acumuladas=CASE WHEN _dados ? 'limite_diarias_acumuladas' THEN nullif(_dados->>'limite_diarias_acumuladas','')::numeric ELSE limite_diarias_acumuladas END,
    limite_entregas_acumuladas=CASE WHEN _dados ? 'limite_entregas_acumuladas' THEN nullif(_dados->>'limite_entregas_acumuladas','')::numeric ELSE limite_entregas_acumuladas END,
    franquia_entregas_tipo=CASE WHEN _dados ? 'franquia_entregas_tipo' THEN _dados->>'franquia_entregas_tipo' ELSE franquia_entregas_tipo END,
    leitura_ia=coalesce(_dados->'leitura_ia',leitura_ia)
  WHERE id=cid;
  IF EXISTS (SELECT 1 FROM public.client_contratos WHERE id=cid AND ativo) THEN
    INSERT INTO public.client_faturamento(client_id,modelo) VALUES (_client,'contrato')
      ON CONFLICT (client_id) DO UPDATE SET modelo='contrato';
  END IF;
  RETURN cid;
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_contrato_cliente(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_contrato_cliente(uuid,jsonb) TO authenticated;


COMMIT;
