-- =========================================================================
-- Fix · coluna contact_name em clients
-- O cadastro rápido de clientes (Onda 1) grava o nome do contato em
-- clients.contact_name, mas a coluna nunca foi criada — insert falhava com
-- "Could not find the 'contact_name' column of 'clients'".
-- =========================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contact_name text;
