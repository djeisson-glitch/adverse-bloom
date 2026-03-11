
-- Add UNIQUE constraint on data_type if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conta_azul_cache_data_type_key'
  ) THEN
    ALTER TABLE conta_azul_cache ADD CONSTRAINT conta_azul_cache_data_type_key UNIQUE (data_type);
  END IF;
END $$;

-- Add anon read policy
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conta_azul_cache' AND policyname = 'Allow anon read'
  ) THEN
    CREATE POLICY "Allow anon read" ON conta_azul_cache FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- Add service role all policy
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conta_azul_cache' AND policyname = 'Allow service role all'
  ) THEN
    CREATE POLICY "Allow service role all" ON conta_azul_cache FOR ALL TO service_role USING (true);
  END IF;
END $$;
