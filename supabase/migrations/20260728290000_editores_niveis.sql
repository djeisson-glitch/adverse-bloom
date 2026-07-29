-- =========================================================================
-- Níveis de edição por cliente: 1 → 2 → 3.
--
-- Pedido do Djêisson: o Zé é o nível 1 do Sul Minas; se ele não estiver
-- disponível, cai pro nível 2; se esse também não, pro 3.
--
-- "Disponível" aqui é objetivo, não opinião: quem tem MENOS fila no horizonte
-- do que consegue vazar. O nível 1 só perde a vez quando a fila dele já
-- passou da capacidade — senão o sistema ficaria empurrando trabalho pro
-- nível 2 por qualquer coisa, e o nível deixaria de significar algo.
-- =========================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS editor_nivel1_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS editor_nivel2_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS editor_nivel3_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.clients.editor_nivel1_id IS
  'Editor preferencial do cliente. O prazo do formulário usa a fila dele; só cai pro nível 2 quando essa fila estoura a capacidade da janela.';

/**
 * Quem vai pegar o trabalho deste cliente, hoje.
 *
 * Desce os níveis até achar alguém cuja fila no horizonte ainda cabe na
 * janela de 14 dias úteis. Se todos estiverem estourados, devolve o nível 1
 * mesmo — é dele o trabalho, e o prazo sai longo, que é a verdade.
 */
CREATE OR REPLACE FUNCTION public.intake_editor_do_cliente(_client_id uuid, _edit_h numeric)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c        record;
  cap      numeric;
  cand     uuid;
BEGIN
  SELECT editor_nivel1_id, editor_nivel2_id, editor_nivel3_id, intake_editor_id
    INTO c FROM public.clients WHERE id = _client_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Capacidade da janela: 10 dias úteis nos próximos 14 corridos.
  cap := 10 * public.intake_horas_uteis_dia();

  FOREACH cand IN ARRAY ARRAY[c.editor_nivel1_id, c.editor_nivel2_id, c.editor_nivel3_id] LOOP
    IF cand IS NOT NULL AND public.intake_fila_horas(cand, _edit_h) < cap THEN
      RETURN cand;
    END IF;
  END LOOP;

  -- Ninguém com folga: fica com o nível 1 (ou o editor fixo antigo).
  RETURN coalesce(c.editor_nivel1_id, c.intake_editor_id);
END $$;

GRANT EXECUTE ON FUNCTION public.intake_editor_do_cliente(uuid, numeric) TO anon, authenticated;
