-- =====================================================================
-- Faturamento por cliente — cada cliente tem um MODELO de cobrança:
--   • horas    → soma horas do mês × valor-hora (ex.: Sicredi Sul Minas)
--   • tabela   → preço fixo por tipo de entrega (ex.: Sicredi Região)
--   • contrato → valor fixo mensal com franquia de diárias/entregas (ex.: SLC)
-- Tudo é dado financeiro: protegido por pode_ver_dinheiro() na RLS.
-- =====================================================================

-- Touch genérico de updated_at (não havia um reutilizável no schema)
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------- 1. Config de cobrança por cliente ----------------------------
CREATE TABLE IF NOT EXISTS public.client_faturamento (
  client_id       uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  modelo          text NOT NULL DEFAULT 'nenhum',   -- nenhum | horas | tabela | contrato
  valor_hora      numeric(12,2) NOT NULL DEFAULT 0, -- modelo 'horas'
  imposto_percent numeric(6,2)  NOT NULL DEFAULT 0,
  margem_percent  numeric(6,2)  NOT NULL DEFAULT 0,
  auto_mensal     boolean NOT NULL DEFAULT true,    -- gera rascunho automático dia 01
  observacoes     text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_faturamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_faturamento sel" ON public.client_faturamento
  FOR SELECT TO authenticated USING (public.pode_ver_dinheiro(auth.uid()));
CREATE POLICY "client_faturamento mut" ON public.client_faturamento
  FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro(auth.uid()))
  WITH CHECK (public.pode_ver_dinheiro(auth.uid()));
DROP TRIGGER IF EXISTS trg_client_faturamento_touch ON public.client_faturamento;
CREATE TRIGGER trg_client_faturamento_touch BEFORE UPDATE ON public.client_faturamento
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ---------- 2. Tabela de preço por tipo de entrega (modelo 'tabela') -----
CREATE TABLE IF NOT EXISTS public.client_precos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo       text NOT NULL,                 -- rótulo: "Vídeo 15s", "Reels", "Vídeo 90s vertical"…
  preco      numeric(12,2) NOT NULL DEFAULT 0,
  ordem      int NOT NULL DEFAULT 0,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_precos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_precos sel" ON public.client_precos
  FOR SELECT TO authenticated USING (public.pode_ver_dinheiro(auth.uid()));
CREATE POLICY "client_precos mut" ON public.client_precos
  FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro(auth.uid()))
  WITH CHECK (public.pode_ver_dinheiro(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_client_precos_client ON public.client_precos (client_id, ordem);

-- ---------- 3. Contrato com franquia (modelo 'contrato') -----------------
CREATE TABLE IF NOT EXISTS public.client_contratos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome           text NOT NULL DEFAULT 'Contrato',
  valor_mensal   numeric(14,2) NOT NULL DEFAULT 0,
  diarias_mes    int NOT NULL DEFAULT 0,     -- franquia de diárias por mês
  entregas_mes   int NOT NULL DEFAULT 0,     -- franquia de entregas por mês
  acumulo_meses  int NOT NULL DEFAULT 2,     -- franquia acumula por até N meses
  inicio         date,
  fim            date,
  ativo          boolean NOT NULL DEFAULT true,
  observacoes    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_contratos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_contratos sel" ON public.client_contratos
  FOR SELECT TO authenticated USING (public.pode_ver_dinheiro(auth.uid()));
CREATE POLICY "client_contratos mut" ON public.client_contratos
  FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro(auth.uid()))
  WITH CHECK (public.pode_ver_dinheiro(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_client_contratos_client ON public.client_contratos (client_id);
DROP TRIGGER IF EXISTS trg_client_contratos_touch ON public.client_contratos;
CREATE TRIGGER trg_client_contratos_touch BEFORE UPDATE ON public.client_contratos
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ---------- 4. Rascunho de faturamento gerado por mês/cliente ------------
CREATE TABLE IF NOT EXISTS public.faturamento_mensal (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ref_mes         date NOT NULL,                 -- 1º dia do mês de referência
  modelo          text NOT NULL,
  horas_edicao    numeric(10,2) NOT NULL DEFAULT 0,
  horas_alteracao numeric(10,2) NOT NULL DEFAULT 0,
  valor_hora      numeric(12,2) NOT NULL DEFAULT 0,
  subtotal        numeric(14,2) NOT NULL DEFAULT 0,
  margem_percent  numeric(6,2)  NOT NULL DEFAULT 0,
  margem_valor    numeric(14,2) NOT NULL DEFAULT 0,
  imposto_percent numeric(6,2)  NOT NULL DEFAULT 0,
  imposto_valor   numeric(14,2) NOT NULL DEFAULT 0,
  total           numeric(14,2) NOT NULL DEFAULT 0,
  detalhe         jsonb NOT NULL DEFAULT '{}',    -- breakdown + relatório (demandas, alterações, itens, consumo, saúde)
  status          text NOT NULL DEFAULT 'rascunho', -- rascunho | revisado | enviado | faturado
  invoice_id      uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  gerado_auto     boolean NOT NULL DEFAULT false,
  gerado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, ref_mes)
);
ALTER TABLE public.faturamento_mensal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "faturamento_mensal sel" ON public.faturamento_mensal
  FOR SELECT TO authenticated USING (public.pode_ver_dinheiro(auth.uid()));
CREATE POLICY "faturamento_mensal mut" ON public.faturamento_mensal
  FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro(auth.uid()))
  WITH CHECK (public.pode_ver_dinheiro(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_faturamento_mensal_ref ON public.faturamento_mensal (ref_mes DESC, client_id);
