-- =========================================================================
-- Onda 5B · Ficha de projeto Catalunya-style — baseada em exploração ao vivo
-- do catalunyaos.com (conta do Djeisson, 2026-07-02).
--
-- Tarefas viram unidades ricas (status próprio, estimativa, timer) e também
-- fazem papel de "peças" (cartela/versão/vigência/locutor). Equipe do
-- projeto com custo/hora por pessoa + fallback do projeto. Comentários
-- polimórficos com @menção.
-- =========================================================================

-- ---------- 1. Tarefas ricas (status Catalunya + estimativa + peça) --------
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS estimativa_horas numeric(6,2),
  ADD COLUMN IF NOT EXISTS cartela text,
  ADD COLUMN IF NOT EXISTS versao text,
  ADD COLUMN IF NOT EXISTS vigencia text,
  ADD COLUMN IF NOT EXISTS locutor text;

-- Status de tarefa no padrão Catalunya (workflow fixo de 6 etapas).
-- Valores antigos ('backlog') migram pra 'aguardando_inicio'.
UPDATE public.tasks SET status = 'aguardando_inicio'
  WHERE status IS NULL OR status IN ('backlog', 'todo', 'pending');

-- Prioridade ganha 'urgente' (texto livre, validação na aplicação):
-- urgente | alta | normal | baixa

-- ---------- 2. Custo/hora padrão do projeto (fallback) ---------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS custo_hora_padrao numeric(12,2);

-- ---------- 3. Entregáveis com formato/duração (padrão produtora) ----------
ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS formato text,     -- 16x9, 9x16, 1x1...
  ADD COLUMN IF NOT EXISTS duracao text;     -- 30", 60", 15"...

-- ---------- 4. Equipe do projeto -------------------------------------------
-- Pessoa adicionada ao projeto aparece no "Custo da equipe" mesmo sem horas.
-- O custo/hora dela vem de profiles.custo_hora (global, por senioridade);
-- se nulo, cai no projects.custo_hora_padrao.
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  papel text,                                -- diretor | produtor | editor | ...
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_members select" ON public.project_members;
CREATE POLICY "project_members select" ON public.project_members
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "project_members mutations" ON public.project_members;
CREATE POLICY "project_members mutations" ON public.project_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members (project_id);

-- ---------- 5. Custos diretos tipados no projeto ---------------------------
-- (budget_custos_diretos é do orçamento; estes são lançados no projeto real)
CREATE TABLE IF NOT EXISTS public.project_costs_lancados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  tipo text NOT NULL DEFAULT 'outro',        -- fornecedor | producao | equipamento | outro
  descricao text NOT NULL,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  data date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_costs_lancados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_costs_lancados select money" ON public.project_costs_lancados;
CREATE POLICY "project_costs_lancados select money" ON public.project_costs_lancados
  FOR SELECT TO authenticated USING (public.can_see_money(auth.uid()));
DROP POLICY IF EXISTS "project_costs_lancados mutations money" ON public.project_costs_lancados;
CREATE POLICY "project_costs_lancados mutations money" ON public.project_costs_lancados
  FOR ALL TO authenticated
  USING (public.can_see_money(auth.uid()))
  WITH CHECK (public.can_see_money(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_project_costs_lancados_project ON public.project_costs_lancados (project_id);

-- ---------- 6. Comentários polimórficos (projeto e orçamento) --------------
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,                 -- 'project' | 'deal'
  entity_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}',     -- user_ids mencionados via @nome
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments select" ON public.comments;
CREATE POLICY "comments select" ON public.comments
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "comments insert own" ON public.comments;
CREATE POLICY "comments insert own" ON public.comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "comments delete own or admin" ON public.comments;
CREATE POLICY "comments delete own or admin" ON public.comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_comments_entity ON public.comments (entity_type, entity_id, created_at);

-- ---------- 7. View custo realizado da equipe por projeto ------------------
-- horas apontadas × custo/hora da pessoa (fallback: custo/hora padrão do projeto)
CREATE OR REPLACE VIEW public.v_custo_equipe_projeto AS
SELECT
  te.project_id,
  te.user_id,
  p.full_name,
  p.email,
  SUM(te.duration_min) / 60.0 AS horas,
  COALESCE(p.custo_hora, proj.custo_hora_padrao, 0) AS custo_hora_efetivo,
  (SUM(te.duration_min) / 60.0) * COALESCE(p.custo_hora, proj.custo_hora_padrao, 0) AS custo
FROM public.time_entries te
JOIN public.profiles p ON p.id = te.user_id
JOIN public.projects proj ON proj.id = te.project_id
WHERE te.project_id IS NOT NULL
GROUP BY te.project_id, te.user_id, p.full_name, p.email, p.custo_hora, proj.custo_hora_padrao;
