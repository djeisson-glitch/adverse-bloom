-- =========================================================================
-- Onda 5C · Briefing macro do projeto + documentos + entregáveis profundos
-- Pedido do Djeisson (2026-07-02): seção de briefing e de documentos na
-- visão macro do projeto; entregáveis com responsável, formato e data.
-- =========================================================================

-- ---------- 1. Briefing consolidado no projeto ------------------------------
-- Estrutura inspirada no print de referência: consolidado, escopo vendido,
-- objetivos, restrições e observações do cliente.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS briefing_consolidado text,
  ADD COLUMN IF NOT EXISTS escopo_vendido text,
  ADD COLUMN IF NOT EXISTS objetivos text,
  ADD COLUMN IF NOT EXISTS restricoes text,
  ADD COLUMN IF NOT EXISTS observacoes_cliente text;

-- ---------- 2. Documentos do projeto (links externos) -----------------------
-- Google Docs, Drive, Notion, Frame.io geral etc.
CREATE TABLE IF NOT EXISTS public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  titulo text NOT NULL,
  url text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_documents select" ON public.project_documents;
CREATE POLICY "project_documents select" ON public.project_documents
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "project_documents mutations" ON public.project_documents;
CREATE POLICY "project_documents mutations" ON public.project_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_project_documents_project ON public.project_documents (project_id);

-- ---------- 3. Entregáveis com responsável ----------------------------------
-- formato/duracao/data_entrega já existem (Ondas 3 e 5B); falta o dono.
ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deliverables_responsavel ON public.deliverables (responsavel_id);
