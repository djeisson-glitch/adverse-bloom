-- =========================================================================
-- Intake: contatos pré-definidos + demandas em andamento no formulário
--
--  Dois pedidos pro formulário público /solicitar/:slug:
--   • contatos: o cliente cadastra as pessoas da equipe dele (nome + e-mail);
--     no formulário viram um "sou fulano" que já preenche nome e e-mail.
--   • andamento: um resumo do que está rolando agora pra aquele cliente, pra a
--     pessoa lembrar antes de abrir mais uma demanda.
--
--  intake_config é SECURITY DEFINER + GRANT anon (a página não tem login).
--  Por isso o retorno é ENXUTO de propósito: nome, etapa e prazo. Nada de
--  dinheiro, id de projeto, nota interna ou nome de editor.
-- =========================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS intake_contatos jsonb NOT NULL DEFAULT '[]'::jsonb;  -- [{nome, email}]

CREATE OR REPLACE FUNCTION public.intake_config(_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c          record;
  andamento  jsonb;
BEGIN
  SELECT id, name, intake_ativo, intake_contatos INTO c
    FROM public.clients WHERE intake_slug = _slug LIMIT 1;
  IF NOT FOUND OR NOT c.intake_ativo THEN
    RETURN NULL;
  END IF;

  -- Resumo do que está em andamento (projetos ativos + demandas ainda na fila).
  -- Campos mínimos — a página é pública.
  SELECT COALESCE(jsonb_agg(to_jsonb(x) - 'ord' ORDER BY x.ord DESC), '[]'::jsonb)
    INTO andamento
  FROM (
    SELECT p.name AS nome,
           'projeto'::text AS tipo,
           coalesce(p.status, '')::text AS etapa,
           p.delivery_date::text AS prazo,
           p.created_at AS ord
      FROM public.projects p
     WHERE p.client_id = c.id
       AND coalesce(p.status, '') NOT IN ('entregue', 'faturado', 'cancelado', 'arquivado')
    UNION ALL
    SELECT d.nome_projeto,
           'demanda'::text,
           'na fila'::text,
           d.prazo_desejado::text,
           d.created_at
      FROM public.demandas d
     WHERE d.client_id = c.id
       AND d.status = 'nova'
    ORDER BY ord DESC
    LIMIT 6
  ) x;

  RETURN jsonb_build_object(
    'nome', c.name,
    'ativo', c.intake_ativo,
    'contatos', COALESCE(c.intake_contatos, '[]'::jsonb),
    'andamento', andamento
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.intake_config(text) TO anon, authenticated;
