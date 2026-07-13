-- =========================================================================
-- Nutrição de leads (pré-funil). Lead = relacionamento antes de virar orçamento.
--  • leads: pessoa/empresa, contatos, origem, temperatura, status, próximo toque
--  • lead_interacoes: timeline de toques (nota/email/whatsapp/ligacao/reuniao)
-- Vira orçamento quando esquenta (deal_id + client_id preenchidos na conversão).
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  empresa text,
  email text,
  telefone text,
  origem text,                                    -- outbound | indicacao | site | redes | evento | outro
  temperatura text NOT NULL DEFAULT 'frio',       -- frio | morno | quente
  status text NOT NULL DEFAULT 'novo',            -- novo | em_nutricao | qualificado | convertido | descartado
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  proximo_toque date,
  observacoes text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads all" ON public.leads;
CREATE POLICY "leads all" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (status, temperatura);
CREATE INDEX IF NOT EXISTS idx_leads_proximo ON public.leads (proximo_toque);

CREATE TABLE IF NOT EXISTS public.lead_interacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'nota',              -- nota | email | whatsapp | ligacao | reuniao
  descricao text,
  data timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_interacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_interacoes all" ON public.lead_interacoes;
CREATE POLICY "lead_interacoes all" ON public.lead_interacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_lead_interacoes_lead ON public.lead_interacoes (lead_id, data DESC);
