-- =========================================================================
-- Padrão único da produtora pro orçamento: margem, imposto e comissões que já
-- vêm preenchidos em todo orçamento novo. Editável pelo botão "Salvar como padrão".
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.orcamento_padroes (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),   -- linha única
  margem numeric NOT NULL DEFAULT 0,
  imposto numeric NOT NULL DEFAULT 0,
  comissoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  comissao_base text NOT NULL DEFAULT 'subtotal2',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orcamento_padroes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orcamento_padroes select" ON public.orcamento_padroes;
CREATE POLICY "orcamento_padroes select" ON public.orcamento_padroes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "orcamento_padroes write" ON public.orcamento_padroes;
CREATE POLICY "orcamento_padroes write" ON public.orcamento_padroes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.orcamento_padroes (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
