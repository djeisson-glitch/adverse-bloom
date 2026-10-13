-- Run only against the isolated schema.sql fixture. All fixtures are rolled back.
BEGIN;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage,public TO authenticated;
GRANT SELECT ON public.clients TO authenticated;
GRANT SELECT,INSERT ON storage.objects TO authenticated;
INSERT INTO clients VALUES ('bbbbbbbb-1111-4111-8111-111111111111','SLC upload fixture');
SET LOCAL ROLE authenticated;
SET LOCAL test.money='true';
INSERT INTO storage.objects(id,name,bucket_id) VALUES
  (gen_random_uuid(),'bbbbbbbb-1111-4111-8111-111111111111/contrato.pdf','contratos-clientes');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name='bbbbbbbb-1111-4111-8111-111111111111/contrato.pdf') THEN
    RAISE EXCEPTION 'Valid contract upload was not readable';
  END IF;
  BEGIN
    INSERT INTO storage.objects VALUES(gen_random_uuid(),'00000000-0000-4000-8000-000000000099/contrato.pdf','contratos-clientes');
    RAISE EXCEPTION 'Unknown client accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO storage.objects VALUES(gen_random_uuid(),'bbbbbbbb-1111-4111-8111-111111111111/contrato.pdf','another-bucket');
    RAISE EXCEPTION 'Wrong bucket accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('test.money','false',true);
  BEGIN
    INSERT INTO storage.objects VALUES(gen_random_uuid(),'bbbbbbbb-1111-4111-8111-111111111111/restricted.pdf','contratos-clientes');
    RAISE EXCEPTION 'Non-finance user accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS: valid upload; unknown client, wrong bucket and non-finance user rejected';
END $$;
ROLLBACK;
