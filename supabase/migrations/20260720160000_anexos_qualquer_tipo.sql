-- Anexos do entregável: liberar QUALQUER tipo de arquivo (PDF, docs, zip, etc.),
-- não só foto/vídeo. allowed_mime_types = NULL no bucket = sem restrição de tipo.
-- O limite de tamanho (500 MB) continua.
UPDATE storage.buckets
   SET allowed_mime_types = NULL
 WHERE id = 'entregaveis';
