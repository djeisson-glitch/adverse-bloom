BEGIN;
ALTER TABLE public.budgets
 ADD COLUMN pdf_primeira_emissao_em timestamptz,
 ADD COLUMN pdf_ultima_emissao_em timestamptz,
 ADD COLUMN pdf_emissoes jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE FUNCTION public.registrar_emissao_pdf(_budget_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE momento timestamptz := clock_timestamp();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
 UPDATE public.budgets SET
  pdf_primeira_emissao_em=coalesce(pdf_primeira_emissao_em,momento),
  pdf_ultima_emissao_em=momento,
  pdf_emissoes=pdf_emissoes || jsonb_build_array(jsonb_build_object('em',momento,'por',auth.uid()))
 WHERE id=_budget_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento indisponível'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.registrar_emissao_pdf(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_emissao_pdf(uuid) TO authenticated;
-- Verifica primeira emissão imutável e reemissões sem deixar alterações de teste.
DO $test$
DECLARE b uuid; u uuid; primeira timestamptz; primeira2 timestamptz; ultima timestamptz; n int;
BEGIN
 BEGIN
  SELECT id INTO b FROM public.budgets LIMIT 1;
  SELECT id INTO u FROM public.profiles LIMIT 1;
  IF b IS NOT NULL AND u IS NOT NULL THEN
   PERFORM set_config('request.jwt.claim.sub',u::text,true);
   UPDATE public.budgets SET pdf_primeira_emissao_em=NULL,pdf_ultima_emissao_em=NULL,pdf_emissoes='[]'::jsonb WHERE id=b;
   PERFORM public.registrar_emissao_pdf(b);
   SELECT pdf_primeira_emissao_em INTO primeira FROM public.budgets WHERE id=b;
   PERFORM public.registrar_emissao_pdf(b);
   SELECT pdf_primeira_emissao_em,pdf_ultima_emissao_em,jsonb_array_length(pdf_emissoes) INTO primeira2,ultima,n FROM public.budgets WHERE id=b;
   IF primeira IS NULL OR primeira IS DISTINCT FROM primeira2 OR ultima < primeira OR n <> 2 THEN RAISE EXCEPTION 'Histórico PDF inconsistente'; END IF;
  END IF;
  RAISE EXCEPTION 'PDF_TEST_ROLLBACK';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PDF_TEST_ROLLBACK' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'Histórico PDF verificado; alterações de teste revertidas';
END $test$;
COMMIT;
