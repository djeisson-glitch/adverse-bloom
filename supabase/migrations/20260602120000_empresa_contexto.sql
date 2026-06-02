-- ============================================================================
-- Contexto da empresa — alimenta a IA de insights pra recomendações sob medida.
-- Tabela singleton (a produtora é uma só), legível por autenticados, editável
-- só por admin.
-- ============================================================================

CREATE TABLE public.empresa_contexto (
  id                      INT PRIMARY KEY DEFAULT 1,
  meta_faturamento_mensal NUMERIC,
  meta_margem_liquida     NUMERIC,   -- % alvo
  headcount               INT,
  estrutura               TEXT,      -- como a operação é estruturada (times, terceiros…)
  sazonalidade            TEXT,      -- meses fortes/fracos
  prioridades             TEXT,      -- objetivos/estratégia atual
  observacoes             TEXT,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT empresa_contexto_singleton CHECK (id = 1)
);

ALTER TABLE public.empresa_contexto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read empresa_contexto"
  ON public.empresa_contexto FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage empresa_contexto"
  ON public.empresa_contexto FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.empresa_contexto (id) VALUES (1) ON CONFLICT DO NOTHING;
