-- =====================================================================
-- Saídas de produção — diárias de gravação, visitas técnicas e qualquer
-- saída da produtora. Fonte da verdade DENTRO do OS; a edge function
-- gcal-sync publica cada uma no calendário Google compartilhado
-- "Gravações | Adverse", pra o time todo ver no próprio celular.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.producao_saidas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text NOT NULL DEFAULT 'saida',        -- diaria | visita_tecnica | saida
  titulo         text NOT NULL,
  project_id     uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  data           date NOT NULL,
  hora_inicio    time,
  hora_fim       time,
  dia_inteiro    boolean NOT NULL DEFAULT false,
  local          text,
  responsavel_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  equipe         uuid[] NOT NULL DEFAULT '{}',         -- ids de team_members
  observacoes    text,
  status         text NOT NULL DEFAULT 'agendada',     -- agendada | confirmada | realizada | cancelada
  -- Espelho no Google Calendar (preenchido pela função gcal-sync)
  gcal_event_id  text,
  gcal_sync_status text,                               -- ok | erro | pendente | desligado
  gcal_synced_at timestamptz,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.producao_saidas ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão dos entregáveis: qualquer pessoa logada do time enxerga e
-- coordena as saídas (não é dado financeiro; o cliente não chega aqui porque
-- o menu/rota é gated por módulo).
CREATE POLICY "saidas select autenticados" ON public.producao_saidas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "saidas mutations autenticados" ON public.producao_saidas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_saidas_data ON public.producao_saidas (data, status);
CREATE INDEX IF NOT EXISTS idx_saidas_project ON public.producao_saidas (project_id);

-- updated_at automático (não havia trigger genérico no schema)
CREATE OR REPLACE FUNCTION public.tg_saidas_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saidas_updated_at ON public.producao_saidas;
CREATE TRIGGER trg_saidas_updated_at
  BEFORE UPDATE ON public.producao_saidas
  FOR EACH ROW EXECUTE FUNCTION public.tg_saidas_updated_at();
