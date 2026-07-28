-- =========================================================================
-- Quem envia ao cliente.
--
-- "Pronto — falta enviar ao cliente" caía na mesa de TODA a coordenação
-- (admin + produtor + coordenadora), porque a regra era o papel e não a
-- pessoa. Na prática quem envia é uma pessoa só; pros outros aquilo era um
-- item com botão laranja que não era deles — o oposto do que a Minha mesa
-- deve fazer.
--
-- Mesma forma dos aprovadores: padrão global + override por projeto. NULL no
-- projeto = herda o global; NULL no global = cai na coordenação inteira, que
-- é o comportamento de hoje (assim ninguém fica sem ver enquanto não
-- configurar).
-- =========================================================================

ALTER TABLE public.approval_settings
  ADD COLUMN IF NOT EXISTS envio_cliente_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.approval_settings.envio_cliente_user_id IS
  'Quem recebe na Minha mesa o "falta enviar ao cliente". NULL = toda a coordenação, como era antes.';

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS envio_cliente_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.projects.envio_cliente_id IS
  'Override por projeto de quem envia ao cliente. NULL = herda approval_settings.';
