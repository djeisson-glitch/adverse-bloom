BEGIN;
ALTER TABLE public.client_contratos
  ADD COLUMN validade_creditos_dias integer CHECK (validade_creditos_dias BETWEEN 1 AND 3660),
  ADD COLUMN limite_diarias_acumuladas numeric CHECK (limite_diarias_acumuladas >= 0),
  ADD COLUMN limite_entregas_acumuladas numeric CHECK (limite_entregas_acumuladas >= 0),
  ADD COLUMN franquia_entregas_tipo text NOT NULL DEFAULT 'todos' CHECK (franquia_entregas_tipo IN ('todos','video','video_foto'));
ALTER TABLE public.deliverables ADD COLUMN tipo_midia text CHECK (tipo_midia IN ('video','foto','outro'));
COMMENT ON COLUMN public.deliverables.tipo_midia IS 'Classificação explícita para consumo de franquia; null usa sugestão conservadora pelo título.';
-- Somente o contrato conferido com o usuário. Outros contratos mantêm a configuração anterior.
UPDATE public.client_contratos SET validade_creditos_dias=60,
  limite_diarias_acumuladas=2, limite_entregas_acumuladas=16, franquia_entregas_tipo='video_foto',
  escopo_entregas=replace(escopo_entregas,
    'A franquia de 8 entregas refere-se a VÍDEOS. O documento não estabelece quantidade de fotografias a entregar; não equiparar automaticamente uma entrega de fotos a um vídeo da franquia.',
    'Regra operacional confirmada por Djêisson em 13/10/2026: vídeos e entregas de fotos compartilham a franquia de 8 entregas mensais. Cada peça cadastrada de fotos equivale a uma entrega, não ao número de imagens do ensaio. Teto compartilhado de 16 entregas. O PDF original menciona vídeos; esta inclusão de fotos é a configuração operacional solicitada posteriormente.'),
  observacoes=replace(replace(coalesce(observacoes,''),
    'A janela de 2 meses do painel é uma aproximação operacional: conferir validade de cada crédito conforme o contrato, não tratar o saldo exibido como apuração exata de 60 dias.',
    'Créditos por competência: validade de 60 dias desde o primeiro dia do mês de referência, consumo dos mais antigos primeiro e saldo máximo de 2 diárias e 16 entregas.'),
    'O painel atual conta peças cadastradas, inclusive fotos, e diárias programadas; a franquia contratada é de vídeos.',
    'Em 13/10/2026, Djêisson definiu que fotos e vídeos compartilham as 8 entregas mensais e o teto de 16. Uma peça de fotos conta como uma entrega. Peças sem tipo reconhecido exigem conferência; diárias programadas contam na data marcada.')
WHERE client_id='44da0825-704b-4624-8269-8f40830e07ff'
  AND ativo AND inicio='2026-02-01' AND fim='2027-01-31';
CREATE OR REPLACE FUNCTION public.contrato_movimentos(_contrato uuid, _ate date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE c public.client_contratos; resultado jsonb; ini date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_ver_dinheiro() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO c FROM public.client_contratos WHERE id = _contrato;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  IF _ate IS NULL THEN RAISE EXCEPTION 'Informe o fim do período'; END IF;
  ini := coalesce(c.inicio, date_trunc('month', _ate)::date);
  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.data DESC, m.id), '[]'::jsonb) INTO resultado
  FROM (
    -- Mesma fonte de datas e classificação do fechamento mensal.
    SELECT d.id::text, 'entrega'::text AS tipo, d.titulo AS titulo,
      (dc.criacao_efetiva AT TIME ZONE 'America/Sao_Paulo')::date AS data,
      to_jsonb(d)->>'tipo_midia' AS tipo_midia, to_jsonb(d)->>'tipo' AS tipo_registro,
      to_jsonb(d)->>'formato' AS formato, to_jsonb(d)->>'duracao' AS duracao,
      1::numeric AS quantidade, d.status::text AS status,
      df.faturamento_efetivo AS faturamento,
      jsonb_build_array(jsonb_build_object('id', p.id, 'nome', p.name)) AS projetos
    FROM public.deliverables d
    JOIN public.projects p ON p.id = d.project_id
    JOIN public.deliverables_criacao dc ON dc.id = d.id
    JOIN public.deliverables_faturamento df ON df.id = d.id
    WHERE p.client_id = c.client_id AND d.status NOT IN ('cancelado', 'reprovado')
      AND (dc.criacao_efetiva AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ini AND least(_ate, coalesce(c.fim, _ate))
    UNION ALL
    -- Uma captação compartilhada no mesmo dia consome a maior fração, não
    -- uma diária por projeto. Cobranças à parte ficam em outra linha.
    SELECT s.data::text || ':' || coalesce(p.faturamento, 'mensal'), 'diaria', 'Captação', s.data, null::text, null::text, null::text, null::text,
      max(s.fracao), CASE WHEN bool_and(s.status = 'realizada') THEN 'realizada' ELSE 'programada' END,
      coalesce(p.faturamento, 'mensal'),
      jsonb_agg(DISTINCT jsonb_build_object('id', p.id, 'nome', p.name))
    FROM public.producao_saidas s JOIN public.projects p ON p.id = s.project_id
    WHERE p.client_id = c.client_id AND s.tipo = 'diaria' AND s.status <> 'cancelada'
      AND s.data BETWEEN ini AND least(_ate, coalesce(c.fim, _ate))
    GROUP BY s.data, coalesce(p.faturamento, 'mensal')
  ) m;
  RETURN resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.contrato_movimentos(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contrato_movimentos(uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.salvar_contrato_cliente(_client uuid, _dados jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE cid uuid;
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
  SELECT id INTO cid FROM public.client_contratos WHERE client_id=_client AND ativo ORDER BY created_at DESC LIMIT 1;
  IF cid IS NULL THEN
    INSERT INTO public.client_contratos(client_id) VALUES (_client) RETURNING id INTO cid;
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
  INSERT INTO public.client_faturamento(client_id,modelo) VALUES (_client,'contrato')
    ON CONFLICT (client_id) DO UPDATE SET modelo='contrato';
  RETURN cid;
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_contrato_cliente(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_contrato_cliente(uuid,jsonb) TO authenticated;

COMMIT;
