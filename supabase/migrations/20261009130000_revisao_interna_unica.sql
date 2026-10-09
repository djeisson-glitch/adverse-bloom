-- Uma única aprovação interna, atribuída à Maiara.
-- Mantém os carimbos históricos de N1/N2; não aprova peças automaticamente.
BEGIN;
DO $$
DECLARE maiara_id uuid; quantidade integer;
BEGIN
  SELECT count(*) INTO quantidade FROM public.profiles
   WHERE ativo IS DISTINCT FROM false AND lower(trim(full_name)) ~ '^maiara([[:space:]]|$)';
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'Esperava uma única Maiara ativa, encontrei %. Confira profiles antes de aplicar.', quantidade;
  END IF;
  SELECT id INTO STRICT maiara_id FROM public.profiles
   WHERE ativo IS DISTINCT FROM false AND lower(trim(full_name)) ~ '^maiara([[:space:]]|$)';
  INSERT INTO public.approval_settings (id, nivel1_user_id, nivel2_user_id)
  VALUES (true, maiara_id, NULL)
  ON CONFLICT (id) DO UPDATE SET nivel1_user_id = EXCLUDED.nivel1_user_id,
    nivel2_user_id = NULL, updated_at = now();
  -- Todos os projetos passam a herdar a única aprovadora global.
  UPDATE public.projects SET aprovador_n1_id = NULL, aprovador_n2_id = NULL
   WHERE aprovador_n1_id IS NOT NULL OR aprovador_n2_id IS NOT NULL;
END $$;

-- Compatibilidade com rotinas antigas que ainda consultam o nível 2.
CREATE OR REPLACE FUNCTION public.aprovador_efetivo(_project_id uuid, _nivel int)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(p.aprovador_n1_id,
    (SELECT nivel1_user_id FROM public.approval_settings WHERE id))
  FROM public.projects p WHERE p.id = _project_id;
$$;

-- Clientes antigos não podem recriar a fila da R2. Executa antes dos demais triggers.
CREATE OR REPLACE FUNCTION public.tg_revisao_interna_unica()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'revisao_n2' THEN NEW.status := 'revisao_n1'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_00_revisao_interna_unica
  BEFORE INSERT OR UPDATE OF status ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_revisao_interna_unica();

-- Peças aguardando a segunda opinião voltam à única fila de revisão.
-- A Maiara decide aprovar ou devolver ao editor; nenhum carimbo é apagado.
UPDATE public.deliverables SET status = 'revisao_n1', updated_at = now()
 WHERE status = 'revisao_n2';

ALTER TABLE public.approval_settings ADD CONSTRAINT approval_settings_sem_n2 CHECK (nivel2_user_id IS NULL);
ALTER TABLE public.projects ADD CONSTRAINT projects_sem_n2 CHECK (aprovador_n2_id IS NULL);
COMMIT;
