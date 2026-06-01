-- ============================================================================
-- Portão de acesso "convidados" — substitui o gating que antes era feito pelo
-- gateway de auth do Lovable. Com Google OAuth nativo do Supabase, QUALQUER
-- conta Google tentaria criar usuário; este trigger bloqueia quem não estiver
-- na allowlist, abortando o signup (o login falha com erro tratado no front).
-- ============================================================================

CREATE TABLE public.allowed_emails (
  email      TEXT PRIMARY KEY,
  nota       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados podem LER a lista (ex.: tela de convites). Escrita só
-- via service_role (admin) por enquanto — gestão por UI fica p/ refinamento.
CREATE POLICY "authenticated read allowed_emails"
  ON public.allowed_emails FOR SELECT TO authenticated USING (true);

-- Checagem no signup. SECURITY DEFINER pra enxergar public.allowed_emails
-- mesmo rodando no contexto do GoTrue. Comparação case-insensitive.
CREATE OR REPLACE FUNCTION public.check_email_allowed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.allowed_emails a
    WHERE lower(a.email) = lower(NEW.email)
  ) THEN
    RAISE EXCEPTION 'EMAIL_NOT_ALLOWED: % não está na lista de convidados', NEW.email
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_email_allowed
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.check_email_allowed();

-- Bootstrap: o dono precisa estar na lista pra conseguir o primeiro login.
INSERT INTO public.allowed_emails (email, nota)
VALUES ('djeisson@adverse.rec.br', 'owner — bootstrap da migração')
ON CONFLICT (email) DO NOTHING;
