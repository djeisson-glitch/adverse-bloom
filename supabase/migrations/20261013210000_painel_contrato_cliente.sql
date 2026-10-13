BEGIN;
-- Reutiliza o contrato operacional e os baldes de faturamento existentes.
ALTER TABLE public.client_contratos
  ALTER COLUMN diarias_mes TYPE numeric(8,2),
  ADD COLUMN IF NOT EXISTS documento_path text,
  ADD COLUMN IF NOT EXISTS documento_nome text,
  ADD COLUMN IF NOT EXISTS escopo_entregas text,
  ADD COLUMN IF NOT EXISTS leitura_ia jsonb;

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
    SELECT s.data::text || ':' || coalesce(p.faturamento, 'mensal'), 'diaria', 'Captação', s.data,
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

-- Classificação do orçamento mora no JSON de proposta que as opções já copiam.
-- Só decisões explícitas novas são propagadas. Não reclassifica o histórico.
CREATE OR REPLACE FUNCTION public.tg_orcamento_faturamento_projeto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE modo text;
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN
    SELECT proposta->>'faturamento' INTO modo FROM public.budgets WHERE id = NEW.budget_id;
    IF modo IN ('mensal','mensal_separado','avulso') THEN NEW.faturamento := modo; END IF;
  ELSE
    modo := NEW.proposta->>'faturamento';
    IF modo IS DISTINCT FROM OLD.proposta->>'faturamento' AND modo IN ('mensal','mensal_separado','avulso') THEN
      UPDATE public.projects SET faturamento = modo WHERE budget_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_budget_faturamento_projetos AFTER UPDATE OF proposta ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.tg_orcamento_faturamento_projeto();
CREATE TRIGGER trg_project_faturamento_budget BEFORE INSERT OR UPDATE OF budget_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_orcamento_faturamento_projeto();

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('contratos-clientes','contratos-clientes',false,10485760,ARRAY['application/pdf','text/plain'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "contratos documentos leitura" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contratos-clientes' AND public.pode_ver_dinheiro());
CREATE POLICY "contratos documentos inserir" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contratos-clientes' AND public.pode_ver_dinheiro()
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id::text = (storage.foldername(name))[1]));

-- Salva contrato e modo de faturamento juntos, sem duplicar ao clicar duas vezes.
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
