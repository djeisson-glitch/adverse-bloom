-- Create projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  sold_value NUMERIC(12,2) DEFAULT 0,
  direct_costs NUMERIC(12,2) DEFAULT 0,
  gross_margin_value NUMERIC(12,2) DEFAULT 0,
  gross_margin_percent NUMERIC(5,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pré-produção',
  sold_date DATE,
  delivery_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view projects"
  ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert projects"
  ON public.projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update projects"
  ON public.projects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete projects"
  ON public.projects FOR DELETE TO authenticated USING (true);

-- Create conta_azul_cache table
CREATE TABLE public.conta_azul_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_type TEXT NOT NULL,
  payload JSONB,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  period TEXT
);

ALTER TABLE public.conta_azul_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cache"
  ON public.conta_azul_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert cache"
  ON public.conta_azul_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update cache"
  ON public.conta_azul_cache FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete cache"
  ON public.conta_azul_cache FOR DELETE TO authenticated USING (true);