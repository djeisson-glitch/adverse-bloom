-- =========================================================================
-- Onda 1 · Fundação — Passo 2/2: rate_card, extensões, RLS, contas/fees,
-- workflows, follow_ups, fornecedores
--
-- Pré-requisito: 20260701120000_onda1_papeis_enum.sql (adiciona valores
-- 'produtor', 'equipe', 'edicao', 'cliente' ao enum public.app_role).
-- =========================================================================

-- ---------- 1. Helpers de papel ---------------------------------------------
-- Pode ver valores em R$ (admin, manager legado, ou produtor)
CREATE OR REPLACE FUNCTION public.can_see_money(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'manager', 'produtor')
  )
$$;

-- Pode apontar horas (todos exceto cliente)
CREATE OR REPLACE FUNCTION public.can_apontar_horas(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'manager', 'produtor', 'operator', 'equipe', 'edicao')
  )
$$;

-- É da equipe de edição (usado no Pós-Produção pra medir capacidade)
CREATE OR REPLACE FUNCTION public.is_edicao(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'edicao'
  )
$$;

-- ---------- 2. Rate card ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_card (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcao text NOT NULL UNIQUE,
  preco_hora numeric(12,2) NOT NULL DEFAULT 0,
  custo_hora numeric(12,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rate_card ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_card select autenticados" ON public.rate_card;
CREATE POLICY "rate_card select autenticados" ON public.rate_card
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rate_card admin mutations" ON public.rate_card;
CREATE POLICY "rate_card admin mutations" ON public.rate_card
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed inicial de funções comuns de produtora
INSERT INTO public.rate_card (funcao, preco_hora, custo_hora, ordem)
VALUES
  ('Direção', 300, 150, 10),
  ('Direção de Fotografia', 280, 140, 20),
  ('Câmera', 200, 100, 30),
  ('Assistente de Câmera', 120, 60, 40),
  ('Produção', 180, 90, 50),
  ('Assistente de Produção', 100, 50, 60),
  ('Edição', 200, 100, 70),
  ('Motion / Finalização', 220, 110, 80),
  ('Áudio', 180, 90, 90),
  ('Foto', 200, 100, 100),
  ('Roteiro', 250, 125, 110),
  ('Atendimento', 180, 90, 120)
ON CONFLICT (funcao) DO NOTHING;

-- ---------- 3. Extensões em profiles ----------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS funcao text,
  ADD COLUMN IF NOT EXISTS funcao_id uuid REFERENCES public.rate_card(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS custo_hora numeric(12,2),
  ADD COLUMN IF NOT EXISTS horas_semana int NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ultima_atividade timestamptz;

DROP POLICY IF EXISTS "Admin update profiles" ON public.profiles;
CREATE POLICY "Admin update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin insert profiles" ON public.profiles;
CREATE POLICY "Admin insert profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR id = auth.uid());

-- ---------- 4. Contas / Fees (guarda-chuva) ---------------------------------
CREATE TABLE IF NOT EXISTS public.contas_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'fee_mensal', -- fee_mensal | retainer | credito
  moeda text NOT NULL DEFAULT 'BRL',       -- BRL | USD
  balde_mensal numeric(14,2),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contas_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contas_fees select money" ON public.contas_fees;
CREATE POLICY "contas_fees select money" ON public.contas_fees
  FOR SELECT TO authenticated USING (public.can_see_money(auth.uid()));
DROP POLICY IF EXISTS "contas_fees admin mutations" ON public.contas_fees;
CREATE POLICY "contas_fees admin mutations" ON public.contas_fees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Vínculo N:1 projeto → conta_fee
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS conta_fee_id uuid REFERENCES public.contas_fees(id) ON DELETE SET NULL;

-- ---------- 5. Workflows customizáveis (esqueleto) --------------------------
CREATE TABLE IF NOT EXISTS public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'projeto',  -- projeto | orcamento | outro
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workflows select autenticados" ON public.workflows;
CREATE POLICY "workflows select autenticados" ON public.workflows
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "workflows admin mutations" ON public.workflows;
CREATE POLICY "workflows admin mutations" ON public.workflows
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.workflows (nome, tipo, stages)
SELECT
  'Padrão de Projeto',
  'projeto',
  '[
    {"id":"aguardando","nome":"Aguardando Início","cor":"#6b7280","ordem":10},
    {"id":"pre_producao","nome":"Pré-Produção","cor":"#3b82f6","ordem":20},
    {"id":"captacao","nome":"Captação","cor":"#f59e0b","ordem":30},
    {"id":"edicao","nome":"Edição","cor":"#8b5cf6","ordem":40},
    {"id":"revisao","nome":"Revisão Cliente","cor":"#ec4899","ordem":50},
    {"id":"entregue","nome":"Entregue","cor":"#10b981","ordem":60},
    {"id":"faturado","nome":"Faturado","cor":"#22c55e","ordem":70}
  ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.workflows WHERE nome = 'Padrão de Projeto');

-- ---------- 6. Follow-ups (esqueleto pra Onda 2) ----------------------------
CREATE TABLE IF NOT EXISTS public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  data_prevista date NOT NULL,
  tipo text NOT NULL,                    -- pos_ganho | pos_perda | manual
  status text NOT NULL DEFAULT 'pendente', -- pendente | concluido | cancelado
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz
);
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follow_ups select autenticados" ON public.follow_ups;
CREATE POLICY "follow_ups select autenticados" ON public.follow_ups
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "follow_ups insert autenticados" ON public.follow_ups;
CREATE POLICY "follow_ups insert autenticados" ON public.follow_ups
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "follow_ups update autenticados" ON public.follow_ups;
CREATE POLICY "follow_ups update autenticados" ON public.follow_ups
  FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "follow_ups admin delete" ON public.follow_ups;
CREATE POLICY "follow_ups admin delete" ON public.follow_ups
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_follow_ups_data ON public.follow_ups (data_prevista, status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_deal ON public.follow_ups (deal_id);

-- ---------- 7. Extensões em supplier_contacts (fornecedores) ----------------
ALTER TABLE public.supplier_contacts
  ADD COLUMN IF NOT EXISTS funcoes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_supplier_contacts_funcoes ON public.supplier_contacts USING gin (funcoes);
CREATE INDEX IF NOT EXISTS idx_supplier_contacts_ativo ON public.supplier_contacts (ativo);

-- ---------- 8. Índices auxiliares -------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_ativo ON public.profiles (ativo);
CREATE INDEX IF NOT EXISTS idx_profiles_funcao_id ON public.profiles (funcao_id);
CREATE INDEX IF NOT EXISTS idx_contas_fees_client ON public.contas_fees (client_id, ativo);
CREATE INDEX IF NOT EXISTS idx_projects_conta_fee ON public.projects (conta_fee_id);
