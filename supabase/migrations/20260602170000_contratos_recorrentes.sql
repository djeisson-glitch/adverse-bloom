-- Contratos recorrentes (MRR). O dono cadastra o valor mensal de cada contrato
-- fixo; o MRR = soma dos contratos ativos.
CREATE TABLE public.contratos_recorrentes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente      TEXT NOT NULL,
  valor_mensal NUMERIC NOT NULL DEFAULT 0,
  ativo        BOOLEAN NOT NULL DEFAULT true,
  observacao   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contratos_recorrentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read contratos" ON public.contratos_recorrentes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage contratos" ON public.contratos_recorrentes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
