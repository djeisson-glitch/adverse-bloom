-- Documentos (roteiro, referências, PDF do cliente) presos a um ENTREGÁVEL,
-- não só ao projeto. Reusa project_documents: deliverable_id nulo = documento
-- do projeto (como era); preenchido = documento daquele entregável.
ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS deliverable_id uuid REFERENCES public.deliverables(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tipo text;  -- roteiro | referencia | briefing | outro

CREATE INDEX IF NOT EXISTS idx_project_documents_deliverable
  ON public.project_documents (deliverable_id);

COMMENT ON COLUMN public.project_documents.deliverable_id IS
  'Nulo = documento do projeto; preenchido = documento daquele entregável.';
