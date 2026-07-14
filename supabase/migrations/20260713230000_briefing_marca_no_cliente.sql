-- =========================================================================
-- Briefing: a MARCA mora no cliente, não no projeto
--  Antes: todo briefing novo perguntava "sobre a marca / empresa" de novo —
--  no 2º, 3º projeto do mesmo cliente isso é redundante (e meio ofensivo).
--
--  Agora:
--   • clients.marca_briefing guarda o contexto da marca (respondido uma vez).
--   • Um trigger espelha a resposta "marca" do briefing do deal pro cliente —
--     vale tanto pro cliente respondendo no formulário quanto pro time editando
--     o mergulho no orçamento.
--   • mergulho_publico devolve marca_cliente: se já temos, o formulário NÃO
--     pergunta de novo (mostra "o que já sabemos sobre vocês" + atualizar).
--
--  Só a pergunta "marca" é de escopo cliente. O resto continua por projeto.
-- =========================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS marca_briefing jsonb;

-- ---- Espelha deals.mergulho->>'marca' para o cliente ---------------------
CREATE OR REPLACE FUNCTION public.tg_mergulho_marca_para_cliente()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m text;
BEGIN
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;
  m := btrim(coalesce(NEW.mergulho->>'marca', ''));
  IF m = '' THEN RETURN NEW; END IF;              -- briefing só de projeto: não mexe
  UPDATE public.clients
     SET marca_briefing = coalesce(marca_briefing, '{}'::jsonb)
                          || jsonb_build_object('marca', m, 'atualizado_em', now())
   WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mergulho_marca ON public.deals;
CREATE TRIGGER trg_mergulho_marca
  AFTER INSERT OR UPDATE OF mergulho ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_mergulho_marca_para_cliente();

-- ---- Semeia com o que já existe (briefings já respondidos) ---------------
UPDATE public.clients c
   SET marca_briefing = jsonb_build_object('marca', src.marca, 'atualizado_em', now())
  FROM (
    SELECT DISTINCT ON (d.client_id)
           d.client_id, btrim(d.mergulho->>'marca') AS marca
      FROM public.deals d
     WHERE d.client_id IS NOT NULL
       AND btrim(coalesce(d.mergulho->>'marca', '')) <> ''
     ORDER BY d.client_id, d.mergulho_em DESC NULLS LAST
  ) src
 WHERE c.id = src.client_id
   AND c.marca_briefing IS NULL;

-- ---- mergulho_publico agora devolve a marca herdada ----------------------
CREATE OR REPLACE FUNCTION public.mergulho_publico(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record;
BEGIN
  SELECT dd.title, dd.mergulho, dd.mergulho_enviado_em,
         c.name AS client_name,
         c.marca_briefing->>'marca' AS marca_cliente
    INTO d
    FROM public.deals dd
    LEFT JOIN public.clients c ON c.id = dd.client_id
   WHERE dd.mergulho_token = _token
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'projeto',       d.title,
    'cliente_nome',  d.client_name,
    'enviado_em',    d.mergulho_enviado_em,
    'marca_cliente', d.marca_cliente,
    'mergulho',      coalesce(d.mergulho, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mergulho_publico(uuid) TO anon, authenticated;
