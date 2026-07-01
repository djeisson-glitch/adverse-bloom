-- =========================================================================
-- Onda 1 · Fundação — Passo 1/2: papéis novos no enum app_role
--
-- Postgres exige que valores adicionados a um enum sejam COMMITADOS antes
-- de poderem ser usados em funções/policies/triggers (SQLSTATE 55P04).
-- Por isso o ADD VALUE vive numa migration separada — o resto (funções,
-- tabelas, RLS que usam 'produtor'/'equipe'/'edicao'/'cliente') está em
-- 20260701120100_onda1_fundacao.sql.
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'produtor' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'produtor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'equipe' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'equipe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'edicao' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'edicao';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cliente' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'cliente';
  END IF;
END $$;
