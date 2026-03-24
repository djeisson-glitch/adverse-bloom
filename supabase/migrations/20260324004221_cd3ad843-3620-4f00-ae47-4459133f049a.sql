ALTER TABLE public.clients ADD COLUMN type text NOT NULL DEFAULT 'cliente';

COMMENT ON COLUMN public.clients.type IS 'cliente or fornecedor';