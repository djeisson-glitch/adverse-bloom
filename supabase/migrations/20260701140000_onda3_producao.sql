-- =========================================================================
-- Onda 3 · Produção — tarefas por projeto, entregáveis, portal do cliente
-- =========================================================================

-- ---------- 1. Tarefas com project_id, responsável e status -----------------
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id text,              -- casa com workflow.stages[i].id
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'backlog',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS ordem int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks (project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public.tasks (assigned_user_id, completed);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON public.tasks (due_date) WHERE completed = false;

-- ---------- 2. Projetos com workflow, orçamento e horas de edição ----------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS budget_id uuid REFERENCES public.budgets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS progress int NOT NULL DEFAULT 0,             -- 0..100
  ADD COLUMN IF NOT EXISTS edicao_horas_vendidas numeric(10,2),         -- pra Pós-Produção
  ADD COLUMN IF NOT EXISTS edicao_horas_mapeadas numeric(10,2),
  ADD COLUMN IF NOT EXISTS numero text,                                 -- código curto (0001, 0002, …)
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_projects_workflow ON public.projects (workflow_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects (status);

-- Sequência pro número do projeto (0001, 0002, …)
CREATE SEQUENCE IF NOT EXISTS public.projects_numero_seq START 1;

CREATE OR REPLACE FUNCTION public.tg_projects_numero()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := lpad(nextval('public.projects_numero_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_numero ON public.projects;
CREATE TRIGGER trg_projects_numero
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_projects_numero();

-- ---------- 3. Progress calculado ao completar tarefa ----------------------
CREATE OR REPLACE FUNCTION public.tg_task_progress_project()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pid uuid;
  total int;
  done int;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO total FROM public.tasks WHERE project_id = pid;
  SELECT COUNT(*) INTO done  FROM public.tasks WHERE project_id = pid AND completed = true;

  UPDATE public.projects
    SET progress = CASE WHEN total > 0 THEN (done * 100 / total) ELSE 0 END
    WHERE id = pid;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_progress_project ON public.tasks;
CREATE TRIGGER trg_task_progress_project
  AFTER INSERT OR UPDATE OF completed OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_task_progress_project();

-- ---------- 4. Entregáveis (deliverables) ----------------------------------
CREATE TABLE IF NOT EXISTS public.deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  titulo text NOT NULL,
  descricao text,
  data_entrega date,
  tipo text NOT NULL DEFAULT 'entregavel',    -- entregavel | tarefa_publica | marco
  status text NOT NULL DEFAULT 'pendente',    -- pendente | em_revisao | aprovado | reprovado
  aprovado_em timestamptz,
  aprovado_por text,                          -- e-mail/nome do aprovador do lado do cliente
  arquivo_url text,                           -- link pra vídeo/imagem/pdf
  visivel_cliente boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deliverables select autenticados" ON public.deliverables
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "deliverables mutations autenticados" ON public.deliverables
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_deliverables_project ON public.deliverables (project_id, data_entrega);
CREATE INDEX IF NOT EXISTS idx_deliverables_data ON public.deliverables (data_entrega, status);

-- ---------- 5. Portal do Cliente (token isolado) ---------------------------
CREATE TABLE IF NOT EXISTS public.client_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  token text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  ultimo_acesso timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Só admin/produtor cria e vê os tokens (é dado sensível)
CREATE POLICY "portal_tokens select money" ON public.client_portal_tokens
  FOR SELECT TO authenticated USING (public.can_see_money(auth.uid()));
CREATE POLICY "portal_tokens admin mutations" ON public.client_portal_tokens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_portal_tokens_token ON public.client_portal_tokens (token) WHERE ativo = true;

-- ---------- 6. RPC pública do portal ---------------------------------------
-- Endpoint SECURITY DEFINER que valida o token e devolve dados do cliente.
-- Chamado pelo /portal/[token] sem sessão Supabase.
CREATE OR REPLACE FUNCTION public.portal_client_data(_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid uuid;
  cliente jsonb;
  projetos jsonb;
  entregaveis jsonb;
BEGIN
  SELECT client_id INTO cid
    FROM public.client_portal_tokens
    WHERE token = _token AND ativo = true
      AND (expires_at IS NULL OR expires_at > now());

  IF cid IS NULL THEN
    RETURN jsonb_build_object('error', 'token inválido ou expirado');
  END IF;

  UPDATE public.client_portal_tokens SET ultimo_acesso = now() WHERE token = _token;

  SELECT jsonb_build_object('id', id, 'name', name) INTO cliente
    FROM public.clients WHERE id = cid;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'numero', p.numero, 'name', p.name, 'status', p.status,
    'progress', p.progress, 'delivery_date', p.delivery_date, 'start_date', p.start_date
  ) ORDER BY p.created_at DESC), '[]'::jsonb) INTO projetos
    FROM public.projects p
    WHERE p.client_id = cid AND p.status IS DISTINCT FROM 'faturado';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id, 'project_id', d.project_id, 'titulo', d.titulo,
    'data_entrega', d.data_entrega, 'status', d.status,
    'arquivo_url', d.arquivo_url, 'tipo', d.tipo
  ) ORDER BY d.data_entrega NULLS LAST), '[]'::jsonb) INTO entregaveis
    FROM public.deliverables d
    JOIN public.projects p ON p.id = d.project_id
    WHERE p.client_id = cid AND d.visivel_cliente = true;

  RETURN jsonb_build_object(
    'client', cliente,
    'projects', projetos,
    'deliverables', entregaveis
  );
END;
$$;

-- Permite chamar via PostgREST anonimamente (autenticação é feita pelo próprio token)
GRANT EXECUTE ON FUNCTION public.portal_client_data(text) TO anon;

-- Endpoint pro cliente aprovar/reprovar um entregável
CREATE OR REPLACE FUNCTION public.portal_deliverable_review(
  _token text,
  _deliverable_id uuid,
  _status text,          -- 'aprovado' | 'reprovado'
  _aprovador text        -- nome/email fornecido pelo cliente
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid uuid;
  d_client_id uuid;
BEGIN
  IF _status NOT IN ('aprovado','reprovado') THEN
    RETURN jsonb_build_object('error', 'status inválido');
  END IF;

  SELECT client_id INTO cid
    FROM public.client_portal_tokens
    WHERE token = _token AND ativo = true
      AND (expires_at IS NULL OR expires_at > now());

  IF cid IS NULL THEN
    RETURN jsonb_build_object('error', 'token inválido');
  END IF;

  SELECT p.client_id INTO d_client_id
    FROM public.deliverables d
    JOIN public.projects p ON p.id = d.project_id
    WHERE d.id = _deliverable_id;

  IF d_client_id IS NULL OR d_client_id <> cid THEN
    RETURN jsonb_build_object('error', 'entregável não pertence ao cliente');
  END IF;

  UPDATE public.deliverables
    SET status = _status,
        aprovado_em = now(),
        aprovado_por = _aprovador,
        updated_at = now()
    WHERE id = _deliverable_id;

  RETURN jsonb_build_object('ok', true, 'status', _status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_deliverable_review(text, uuid, text, text) TO anon;
