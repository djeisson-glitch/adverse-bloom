-- Anexos de MÍDIA (fotos e vídeos) no entregável — upload real pro Storage.
-- Diferente de project_documents, que são LINKS (roteiro, referência, PDF do
-- cliente). Aqui o arquivo mora no bucket "entregaveis" e a linha guarda o
-- caminho pra dar pra apagar o objeto junto.

CREATE TABLE IF NOT EXISTS public.deliverable_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id uuid REFERENCES public.deliverables(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'arquivo',   -- foto | video | arquivo
  url text NOT NULL,                       -- URL pública (pra <img>/<video> e download)
  storage_path text NOT NULL,              -- caminho no bucket (pra remover o objeto)
  mime text,
  tamanho bigint,                          -- bytes
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliverable_anexos_deliverable
  ON public.deliverable_anexos (deliverable_id);

ALTER TABLE public.deliverable_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deliverable_anexos select" ON public.deliverable_anexos;
CREATE POLICY "deliverable_anexos select" ON public.deliverable_anexos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "deliverable_anexos mutations" ON public.deliverable_anexos;
CREATE POLICY "deliverable_anexos mutations" ON public.deliverable_anexos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bucket de mídia dos entregáveis: leitura pública (pra renderizar a foto/vídeo),
-- upload/alteração/remoção só autenticado. Limite por arquivo em 500 MB — vídeo
-- grande mesmo é melhor mandar como link do Frame.io (project_documents).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'entregaveis', 'entregaveis', true, 524288000,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif',
    'video/mp4','video/quicktime','video/webm','video/x-matroska','video/x-msvideo'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "entregaveis auth upload" ON storage.objects;
CREATE POLICY "entregaveis auth upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'entregaveis');

DROP POLICY IF EXISTS "entregaveis auth update" ON storage.objects;
CREATE POLICY "entregaveis auth update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'entregaveis');

DROP POLICY IF EXISTS "entregaveis auth delete" ON storage.objects;
CREATE POLICY "entregaveis auth delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'entregaveis');

DROP POLICY IF EXISTS "entregaveis public read" ON storage.objects;
CREATE POLICY "entregaveis public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'entregaveis');
