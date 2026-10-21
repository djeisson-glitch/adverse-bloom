BEGIN;
-- NULL acompanha o nome/formato automaticamente no app. Um conjunto manual
-- prevalece até a pessoa escolher Automático novamente. Sem backfill ou IA.
ALTER TABLE public.deliverables ADD COLUMN classificacao_visual text[];
ALTER TABLE public.deliverables ADD CONSTRAINT deliverables_classificacao_visual_valida CHECK (
 classificacao_visual IS NULL OR (
   cardinality(classificacao_visual) BETWEEN 1 AND 7
   AND array_position(classificacao_visual,NULL) IS NULL
   AND classificacao_visual <@ ARRAY['16x9','reels','story','youtube','vertical','fotos','outros']::text[]
 )
);
COMMENT ON COLUMN public.deliverables.classificacao_visual IS 'Categorias visuais manuais; NULL = automático pelo nome/formato. Não altera cobrança nem contrato.';
COMMIT;
