-- Papel "coordenadora": coordena produção (projetos, entregáveis, pauta,
-- aprovação) sem ver dinheiro nem horas. Não é acesso novo no código — é um
-- rótulo pro painel semear os grupos certos e esconder valores/horas.
-- ADD VALUE fica em arquivo próprio: não pode ser usado na mesma transação.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum
                  WHERE enumlabel = 'coordenadora'
                    AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'coordenadora';
  END IF;
END $$;
