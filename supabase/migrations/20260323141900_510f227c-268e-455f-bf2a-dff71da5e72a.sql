
-- Tasks table linked to deals
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_date date,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read tasks" ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update tasks" ON public.tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete tasks" ON public.tasks FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Commercial settings table
CREATE TABLE public.commercial_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_target numeric NOT NULL DEFAULT 200000,
  followup_won_days integer NOT NULL DEFAULT 180,
  followup_lost_days integer NOT NULL DEFAULT 60,
  loss_reasons jsonb NOT NULL DEFAULT '["Preço alto","Sem budget agora","Escolheu concorrente","Projeto cancelado","Sem resposta","Outro"]'::jsonb,
  pipeline_stages jsonb NOT NULL DEFAULT '[{"id":"contato","label":"Contato Inicial","color":"#3b82f6"},{"id":"proposta","label":"Proposta","color":"#f59e0b"},{"id":"negociacao","label":"Negociação","color":"#8b5cf6"},{"id":"ganho","label":"Ganho","color":"#22c55e"},{"id":"perdido","label":"Perdido","color":"#ef4444"}]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commercial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read commercial_settings" ON public.commercial_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert commercial_settings" ON public.commercial_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update commercial_settings" ON public.commercial_settings FOR UPDATE TO authenticated USING (true);

-- Add lost_reason column to deals
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS lost_reason text;

-- Seed default commercial settings
INSERT INTO public.commercial_settings (id) VALUES (gen_random_uuid());
