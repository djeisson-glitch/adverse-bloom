-- O cliente mora no PROJETO e desce pra tudo que está dentro dele.
--
-- Entregáveis e tarefas passam a ter client_id preenchido automaticamente a
-- partir do projeto. Não é campo de tela: é vínculo pro sistema inteiro
-- entender de quem é aquela peça (filtro, relatório, faturamento) sem precisar
-- de join até projects toda vez.
--
-- Três garantias:
--   1) nasceu no projeto  → herda na hora (BEFORE INSERT);
--   2) mudou de projeto   → reherda (BEFORE UPDATE OF project_id);
--   3) trocou o cliente do projeto → propaga pra tudo que está dentro.

ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deliverables_client ON public.deliverables (client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_client        ON public.tasks (client_id);

COMMENT ON COLUMN public.deliverables.client_id IS
  'Herdado do projeto por trigger — não editar à mão; troque o cliente no projeto.';
COMMENT ON COLUMN public.tasks.client_id IS
  'Herdado do projeto por trigger — não editar à mão; troque o cliente no projeto.';

-- SECURITY DEFINER: lê projects.client_id mesmo pra quem não enxerga a tabela
-- clients (a coordenadora, por exemplo). Só o id trafega, nenhum dado do cliente.
CREATE OR REPLACE FUNCTION public.tg_herda_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT p.client_id INTO NEW.client_id FROM public.projects p WHERE p.id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deliverables_cliente ON public.deliverables;
CREATE TRIGGER trg_deliverables_cliente
  BEFORE INSERT OR UPDATE OF project_id ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_herda_cliente();

DROP TRIGGER IF EXISTS trg_tasks_cliente ON public.tasks;
CREATE TRIGGER trg_tasks_cliente
  BEFORE INSERT OR UPDATE OF project_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_herda_cliente();

-- Trocou o cliente do projeto: tudo que está dentro acompanha.
CREATE OR REPLACE FUNCTION public.tg_propaga_cliente_projeto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    UPDATE public.deliverables SET client_id = NEW.client_id WHERE project_id = NEW.id;
    UPDATE public.tasks        SET client_id = NEW.client_id WHERE project_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_propaga_cliente ON public.projects;
CREATE TRIGGER trg_projects_propaga_cliente
  AFTER UPDATE OF client_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_propaga_cliente_projeto();

-- Alinha o que já existe (uma vez só).
UPDATE public.deliverables d
   SET client_id = p.client_id
  FROM public.projects p
 WHERE d.project_id = p.id
   AND d.client_id IS DISTINCT FROM p.client_id;

UPDATE public.tasks t
   SET client_id = p.client_id
  FROM public.projects p
 WHERE t.project_id = p.id
   AND t.client_id IS DISTINCT FROM p.client_id;
