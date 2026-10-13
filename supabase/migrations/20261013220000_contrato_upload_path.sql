-- Qualify the outer object name: clients.name otherwise shadows it in EXISTS.
ALTER POLICY "contratos documentos inserir" ON storage.objects
WITH CHECK (
  bucket_id = 'contratos-clientes'
  AND public.pode_ver_dinheiro()
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
  )
);
