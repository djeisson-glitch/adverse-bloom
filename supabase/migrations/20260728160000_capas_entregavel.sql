-- =========================================================================
-- Capas (imagem) no entregável — pedido pro cliente Sicredi Região da Produção.
--
-- Duas decisões:
--
--  1. Reusa deliverable_anexos + bucket "entregaveis" em vez de tabela e
--     bucket novos. Muda só a CATEGORIA — capa é um anexo com papel definido,
--     não outra espécie de arquivo. Um sistema paralelo significaria repetir
--     RLS, upload, remoção do objeto e limpeza.
--
--  2. O recorte por cliente vira FLAG na ficha do cliente, não o nome
--     "Sicredi Região da Produção" chumbado no código. Amanhã outro cliente
--     pede o mesmo e ninguém vai lembrar de procurar um if com nome próprio
--     dentro do componente.
-- =========================================================================

ALTER TABLE public.deliverable_anexos
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'midia';

COMMENT ON COLUMN public.deliverable_anexos.categoria IS
  'midia = foto/vídeo do material; capa = thumbnail/capa da peça. Só muda onde aparece na ficha.';

CREATE INDEX IF NOT EXISTS idx_deliverable_anexos_categoria
  ON public.deliverable_anexos (deliverable_id, categoria);

-- Quem usa capa. Default false: hoje é só o Sicredi Região da Produção.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS usa_capas boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.usa_capas IS
  'Liga a seção de Capas na ficha do entregável. Ligado a pedido pro Sicredi Região da Produção.';

UPDATE public.clients
   SET usa_capas = true
 WHERE name ILIKE '%Sicredi Regi%o da Produ%';
