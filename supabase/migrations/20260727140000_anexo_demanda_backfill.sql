-- =========================================================================
-- Backfill: anexo que o cliente mandou na demanda e ficou órfão.
--
-- A conversão demanda -> projeto nunca levou os anexos junto. Quem abria o
-- projeto criado não via nada e tinha que voltar na demanda, baixar o arquivo
-- e re-anexar à mão (foi o que o Robert fez com o PDF do Eduardo).
--
-- O código já foi corrigido pra levar daqui pra frente. Isto recupera o que
-- já tinha sido convertido antes da correção.
--
-- Idempotente: só insere se ainda não existe documento com a MESMA URL
-- naquele projeto — quem já re-anexou à mão não ganha duplicata.
-- =========================================================================

INSERT INTO public.project_documents (project_id, titulo, url, tipo)
SELECT d.projeto_id,
       COALESCE(a.value->>'nome', 'Anexo do cliente'),
       a.value->>'url',
       'briefing'
  FROM public.demandas d
 CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(d.anexos) = 'array' THEN d.anexos ELSE '[]'::jsonb END
      ) AS a(value)
 WHERE d.projeto_id IS NOT NULL
   AND a.value->>'url' IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.project_documents pd
      WHERE pd.project_id = d.projeto_id
        AND pd.url = a.value->>'url'
   );
