-- Unificar clientes duplicados: tudo que aponta pro duplicado passa a apontar
-- pro cliente mantido, e o duplicado é removido.
--
-- 15 tabelas referenciam clients (projetos, orçamentos, faturas, contratos,
-- portal, leads, entregáveis, tarefas…). Em vez de listar na mão — e esquecer
-- a próxima que alguém criar — as FKs são descobertas no catálogo.
--
-- Duas tabelas têm unicidade por cliente e quebrariam o UPDATE:
--   • client_faturamento  (client_id é a PK)
--   • faturamento_mensal  (único por client_id + ref_mes)
-- Nelas, quando o cliente MANTIDO já tem a linha, a do duplicado é descartada.
--
-- Tudo roda numa transação: ou unifica inteiro, ou não mexe em nada.

CREATE OR REPLACE FUNCTION public.unificar_clientes(_manter uuid, _remover uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n int;
  movidos jsonb := '{}'::jsonb;
  nome_manter text;
  nome_remover text;
BEGIN
  -- Operação destrutiva: só admin.
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Só admin pode unificar clientes';
  END IF;

  IF _manter IS NULL OR _remover IS NULL OR _manter = _remover THEN
    RAISE EXCEPTION 'Escolha dois clientes diferentes';
  END IF;

  SELECT name INTO nome_manter  FROM public.clients WHERE id = _manter;
  SELECT name INTO nome_remover FROM public.clients WHERE id = _remover;
  IF nome_manter IS NULL THEN RAISE EXCEPTION 'O cliente a manter não existe'; END IF;
  IF nome_remover IS NULL THEN RAISE EXCEPTION 'O cliente a remover não existe'; END IF;

  -- Conflitos de unicidade: o que o mantido já tem prevalece.
  DELETE FROM public.client_faturamento
   WHERE client_id = _remover
     AND EXISTS (SELECT 1 FROM public.client_faturamento k WHERE k.client_id = _manter);

  DELETE FROM public.faturamento_mensal d
   WHERE d.client_id = _remover
     AND EXISTS (
       SELECT 1 FROM public.faturamento_mensal k
        WHERE k.client_id = _manter AND k.ref_mes = d.ref_mes
     );

  -- Reaponta tudo que referencia clients.
  FOR r IN
    SELECT c.conrelid::regclass::text AS tabela, a.attname AS coluna
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
     WHERE c.confrelid = 'public.clients'::regclass AND c.contype = 'f'
     ORDER BY 1
  LOOP
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.tabela, r.coluna, r.coluna)
      USING _manter, _remover;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      movidos := movidos || jsonb_build_object(r.tabela, n);
    END IF;
  END LOOP;

  -- O nome denormalizado do projeto acompanha o cliente mantido.
  UPDATE public.projects SET client_name = nome_manter WHERE client_id = _manter;

  DELETE FROM public.clients WHERE id = _remover;

  RETURN jsonb_build_object(
    'ok', true,
    'mantido', nome_manter,
    'removido', nome_remover,
    'movidos', movidos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unificar_clientes(uuid, uuid) TO authenticated;
