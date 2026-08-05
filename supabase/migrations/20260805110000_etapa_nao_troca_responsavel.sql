-- =========================================================================
-- Mudar de etapa não troca o responsável da peça
--
-- `mover_etapa` fazia `responsavel_id = coalesce(dono, responsavel_id)`:
-- mandar a peça pra color escrevia o dono da color como responsável do
-- ENTREGÁVEL. O responsável original sumia sem deixar rastro, e depois de
-- duas ou três etapas ninguém sabia mais de quem a peça era — que é
-- exatamente o problema que a coluna "responsável" existe pra resolver.
--
-- São dois papéis diferentes e agora são duas colunas: `responsavel_id`
-- responde pelo entregável de ponta a ponta; `etapa_responsavel_id` é quem
-- está com ele AGORA, e só existe enquanto a peça estiver numa etapa.
-- =========================================================================

ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS etapa_responsavel_id uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.deliverables.etapa_responsavel_id IS
  'Quem está com a peça na etapa atual. NÃO substitui responsavel_id, que '
  'responde pelo entregável inteiro. Limpo quando a peça sai das etapas.';

CREATE OR REPLACE FUNCTION public.mover_etapa(
  _deliverable_id uuid, _etapa text, _user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dono uuid;
BEGIN
  IF _etapa IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.etapas_pos WHERE slug = _etapa) THEN
    RETURN jsonb_build_object('erro', 'etapa desconhecida');
  END IF;

  dono := coalesce(_user_id, public.etapa_dono_sugerido(_etapa));

  -- O responsável DA PEÇA não se mexe. Quem responde pelo entregável de ponta
  -- a ponta continua sendo quem era; a etapa tem dono próprio, em coluna
  -- própria. Antes isto era `responsavel_id = coalesce(dono, responsavel_id)`
  -- e mandar a peça pra color trocava o responsável — o original sumia sem
  -- deixar rastro, e no fim ninguém sabia de quem a peça era.
  UPDATE public.deliverables
     SET etapa_atual = _etapa,
         -- Sair das etapas (_etapa NULL) limpa o dono da etapa junto: etapa
         -- que não existe não pode ter responsável pendurado.
         etapa_responsavel_id = CASE WHEN _etapa IS NULL THEN NULL ELSE dono END
   WHERE id = _deliverable_id;

  RETURN jsonb_build_object('ok', true, 'etapa', _etapa, 'responsavel', dono);
END $$;
GRANT EXECUTE ON FUNCTION public.mover_etapa(uuid, text, uuid) TO authenticated;
