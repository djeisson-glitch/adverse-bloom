-- =========================================================================
-- Onda 4 · Operação — apontamento, capacidade, planejamento, fechamento,
-- faturamento e rentabilidade por projeto.
-- =========================================================================

-- ---------- 1. Time entries (apontamento de horas) --------------------------
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  start_at timestamptz NOT NULL,
  duration_min int NOT NULL CHECK (duration_min >= 0),
  description text,
  billable boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual',  -- manual | timer | calendar
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Cada pessoa vê e edita as próprias horas; admin/produtor veem tudo
DROP POLICY IF EXISTS "time_entries select own" ON public.time_entries;
CREATE POLICY "time_entries select own" ON public.time_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_see_money(auth.uid()));

DROP POLICY IF EXISTS "time_entries insert own" ON public.time_entries;
CREATE POLICY "time_entries insert own" ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.can_see_money(auth.uid()));

DROP POLICY IF EXISTS "time_entries update own" ON public.time_entries;
CREATE POLICY "time_entries update own" ON public.time_entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.can_see_money(auth.uid()));

DROP POLICY IF EXISTS "time_entries delete own" ON public.time_entries;
CREATE POLICY "time_entries delete own" ON public.time_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON public.time_entries (user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON public.time_entries (project_id, start_at);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON public.time_entries (task_id);

-- ---------- 2. Planejamento futuro (alocação semanal) -----------------------
CREATE TABLE IF NOT EXISTS public.time_planning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  semana date NOT NULL,                    -- data do domingo
  horas numeric(6,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id, semana)
);
ALTER TABLE public.time_planning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "time_planning select" ON public.time_planning;
CREATE POLICY "time_planning select" ON public.time_planning
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "time_planning mutations money" ON public.time_planning;
CREATE POLICY "time_planning mutations money" ON public.time_planning
  FOR ALL TO authenticated
  USING (public.can_see_money(auth.uid()))
  WITH CHECK (public.can_see_money(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_time_planning_semana ON public.time_planning (semana, user_id);

-- ---------- 3. Faturas ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  descricao text,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  moeda text NOT NULL DEFAULT 'BRL',
  data_emissao date NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento date,
  data_pagamento date,
  status text NOT NULL DEFAULT 'rascunho',  -- rascunho | enviada | paga | atrasada
  conta_azul_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices select money" ON public.invoices;
CREATE POLICY "invoices select money" ON public.invoices
  FOR SELECT TO authenticated USING (public.can_see_money(auth.uid()));
DROP POLICY IF EXISTS "invoices mutations money" ON public.invoices;
CREATE POLICY "invoices mutations money" ON public.invoices
  FOR ALL TO authenticated
  USING (public.can_see_money(auth.uid()))
  WITH CHECK (public.can_see_money(auth.uid()));

-- Sequência pra numerar faturas
CREATE SEQUENCE IF NOT EXISTS public.invoices_numero_seq START 1;
CREATE OR REPLACE FUNCTION public.tg_invoices_numero()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := 'INV-' || lpad(nextval('public.invoices_numero_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_numero ON public.invoices;
CREATE TRIGGER trg_invoices_numero
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_invoices_numero();

CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (status, data_emissao);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON public.invoices (project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices (client_id);

-- ---------- 4. Fechamento definitivo por projeto ----------------------------
CREATE TABLE IF NOT EXISTS public.project_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL UNIQUE,
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  horas_totais numeric(10,2) NOT NULL DEFAULT 0,
  custo_interno numeric(14,2) NOT NULL DEFAULT 0,
  custos_externos numeric(14,2) NOT NULL DEFAULT 0,
  custo_total numeric(14,2) NOT NULL DEFAULT 0,
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  margem_final numeric(14,2) NOT NULL DEFAULT 0,
  margem_percent numeric(6,2)
);
ALTER TABLE public.project_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "closures select money" ON public.project_closures;
CREATE POLICY "closures select money" ON public.project_closures
  FOR SELECT TO authenticated USING (public.can_see_money(auth.uid()));
DROP POLICY IF EXISTS "closures admin mutations" ON public.project_closures;
CREATE POLICY "closures admin mutations" ON public.project_closures
  FOR ALL TO authenticated
  USING (public.can_see_money(auth.uid()))
  WITH CHECK (public.can_see_money(auth.uid()));

-- ---------- 5. Views (base do Fechamento/Capacidade/Rentabilidade) ---------

-- Horas apontadas por projeto (agregado do time_entries)
CREATE OR REPLACE VIEW public.v_horas_por_projeto AS
SELECT
  te.project_id,
  SUM(te.duration_min) / 60.0                 AS horas_totais,
  SUM(CASE WHEN te.billable THEN te.duration_min ELSE 0 END) / 60.0 AS horas_faturaveis,
  SUM(te.duration_min * COALESCE(p.custo_hora, 0)) / 60.0            AS custo_interno
FROM public.time_entries te
JOIN public.profiles p ON p.id = te.user_id
GROUP BY te.project_id;

-- Rentabilidade por projeto = valor vendido − (custo interno + custos diretos externos)
CREATE OR REPLACE VIEW public.v_rentabilidade_projeto AS
SELECT
  proj.id AS project_id,
  proj.numero,
  proj.name,
  proj.client_name,
  proj.status,
  COALESCE(h.horas_totais, 0)     AS horas,
  COALESCE(proj.sold_value, 0)    AS valor,
  COALESCE(proj.direct_costs, 0)  AS custos_externos,
  COALESCE(h.custo_interno, 0)    AS custo_interno,
  COALESCE(proj.direct_costs, 0) + COALESCE(h.custo_interno, 0) AS custo_total,
  COALESCE(proj.sold_value, 0)
    - COALESCE(proj.direct_costs, 0)
    - COALESCE(h.custo_interno, 0) AS margem,
  CASE
    WHEN COALESCE(proj.sold_value, 0) > 0
      THEN ((COALESCE(proj.sold_value, 0)
             - COALESCE(proj.direct_costs, 0)
             - COALESCE(h.custo_interno, 0))
            / proj.sold_value * 100)
    ELSE NULL
  END AS margem_percent
FROM public.projects proj
LEFT JOIN public.v_horas_por_projeto h ON h.project_id = proj.id;

-- Capacidade da semana por usuário
-- semana referência = próximo domingo passado; retorno tem apontado_faturavel, capacidade
CREATE OR REPLACE VIEW public.v_capacidade_semana AS
WITH ref AS (
  SELECT date_trunc('week', CURRENT_DATE)::date AS ini_semana
), horas_semana AS (
  SELECT
    te.user_id,
    SUM(te.duration_min) / 60.0                              AS horas_apontadas,
    SUM(CASE WHEN te.billable THEN te.duration_min ELSE 0 END) / 60.0 AS horas_faturaveis
  FROM public.time_entries te, ref
  WHERE te.start_at >= ref.ini_semana
    AND te.start_at <  ref.ini_semana + INTERVAL '7 days'
  GROUP BY te.user_id
)
SELECT
  p.id                              AS user_id,
  p.full_name,
  p.email,
  COALESCE(p.horas_semana, 40)      AS capacidade,
  COALESCE(hs.horas_apontadas, 0)   AS horas_apontadas,
  COALESCE(hs.horas_faturaveis, 0)  AS horas_faturaveis,
  CASE
    WHEN COALESCE(p.horas_semana, 40) > 0
      THEN (COALESCE(hs.horas_faturaveis, 0) / p.horas_semana * 100)
    ELSE 0
  END                               AS ocupacao_percent
FROM public.profiles p
LEFT JOIN horas_semana hs ON hs.user_id = p.id
WHERE p.ativo IS DISTINCT FROM false;

-- Ponte pro Conta Azul: quando fatura vira 'paga', gera linha em conta_azul_cache
-- (a reconciliação real com API do CA fica com a Edge Function existente)
CREATE OR REPLACE FUNCTION public.tg_invoice_paid_cache_ca()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paga' AND (OLD.status IS DISTINCT FROM 'paga') THEN
    NEW.data_pagamento := COALESCE(NEW.data_pagamento, CURRENT_DATE);

    -- Grava snapshot da fatura no cache do CA marcando o projeto
    INSERT INTO public.conta_azul_cache (data_type, period, payload, fetched_at)
    VALUES (
      'invoice_paid_snapshot',
      to_char(COALESCE(NEW.data_pagamento, CURRENT_DATE), 'YYYY-MM'),
      jsonb_build_object(
        'invoice_id', NEW.id,
        'numero', NEW.numero,
        'client_id', NEW.client_id,
        'project_id', NEW.project_id,
        'valor', NEW.valor,
        'moeda', NEW.moeda,
        'data_pagamento', NEW.data_pagamento
      ),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_paid_cache_ca ON public.invoices;
CREATE TRIGGER trg_invoice_paid_cache_ca
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_paid_cache_ca();
