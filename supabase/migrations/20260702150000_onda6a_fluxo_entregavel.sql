-- =========================================================================
-- Onda 6A · Fluxo de entregáveis, aprovação em 2 níveis, alterações do
-- cliente e timesheet por entregável.
-- Pedido do Djeisson (2026-07-02): entregável vira a unidade de produção.
-- =========================================================================

-- ---------- 1. Entregável: contadores, aprovação, status próprio ------------
ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS revisoes_internas int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aprovado_n1_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_n1_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovado_n2_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_n2_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovado_cliente_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_cliente_por text;
-- status do entregável (text livre): pendente | em_edicao | revisao_n1 |
-- revisao_n2 | com_cliente | ajuste_solicitado | aprovado | entregue

-- ---------- 2. Alterações do cliente (entidade rastreável) ------------------
-- Só nascem de pedido do cliente: portal OU botão manual no entregável.
CREATE TABLE IF NOT EXISTS public.deliverable_alteracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id uuid REFERENCES public.deliverables(id) ON DELETE CASCADE NOT NULL,
  numero int NOT NULL DEFAULT 1,                 -- R1, R2... por entregável
  titulo text NOT NULL,
  descricao text,                                -- o que o cliente pediu
  origem text NOT NULL DEFAULT 'cliente',        -- cliente | (reservado)
  status text NOT NULL DEFAULT 'aberta',         -- aberta | resolvida
  -- replica infos do entregável (snapshot/override opcional)
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prazo date,
  arquivo_url text,
  criado_por text,                               -- nome/email de quem registrou (cliente ou membro)
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.deliverable_alteracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alteracoes select" ON public.deliverable_alteracoes;
CREATE POLICY "alteracoes select" ON public.deliverable_alteracoes
  FOR SELECT TO authenticated USING (true);
-- Muta só quem não é cliente (o cliente age via RPC do portal, sem sessão)
DROP POLICY IF EXISTS "alteracoes mutations" ON public.deliverable_alteracoes;
CREATE POLICY "alteracoes mutations" ON public.deliverable_alteracoes
  FOR ALL TO authenticated
  USING (public.can_apontar_horas(auth.uid()))
  WITH CHECK (public.can_apontar_horas(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_alteracoes_deliverable ON public.deliverable_alteracoes (deliverable_id);

-- ---------- 3. Time entries por entregável / alteração ----------------------
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS deliverable_id uuid REFERENCES public.deliverables(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS alteracao_id uuid REFERENCES public.deliverable_alteracoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_deliverable ON public.time_entries (deliverable_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_alteracao ON public.time_entries (alteracao_id);

-- ---------- 4. Config de aprovação (global + override por projeto) ----------
CREATE TABLE IF NOT EXISTS public.approval_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),   -- linha única
  nivel1_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nivel2_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cliente_aprova boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.approval_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_settings select" ON public.approval_settings;
CREATE POLICY "approval_settings select" ON public.approval_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "approval_settings admin" ON public.approval_settings;
CREATE POLICY "approval_settings admin" ON public.approval_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.approval_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Override por projeto (NULL = usa o global)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS aprovador_n1_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovador_n2_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_aprova boolean;   -- NULL = herda do global

-- ---------- 5. Fix RLS de deliverables (bug #8 do review) -------------------
-- Antes: FOR ALL USING(true) WITH CHECK(true) — qualquer autenticado mutava.
-- Agora: leitura livre, mutação só pra quem não é cliente. (Cliente atua via
-- RPC do portal, que é SECURITY DEFINER.)
DROP POLICY IF EXISTS "deliverables mutations autenticados" ON public.deliverables;
DROP POLICY IF EXISTS "deliverables mutations" ON public.deliverables;
CREATE POLICY "deliverables mutations equipe" ON public.deliverables
  FOR ALL TO authenticated
  USING (public.can_apontar_horas(auth.uid()))
  WITH CHECK (public.can_apontar_horas(auth.uid()));

-- ---------- 6. View de horas por entregável (edição pura × alteração) -------
CREATE OR REPLACE VIEW public.v_horas_entregavel AS
SELECT
  te.deliverable_id,
  SUM(te.duration_min) / 60.0 AS horas_total,
  SUM(CASE WHEN te.alteracao_id IS NULL THEN te.duration_min ELSE 0 END) / 60.0 AS horas_edicao_pura,
  SUM(CASE WHEN te.alteracao_id IS NOT NULL THEN te.duration_min ELSE 0 END) / 60.0 AS horas_alteracao_cliente
FROM public.time_entries te
WHERE te.deliverable_id IS NOT NULL
GROUP BY te.deliverable_id;

-- Total de horas rastreadas por projeto (soma de todos os time_entries do projeto,
-- inclui as lançadas via entregável já que elas também carregam project_id).
CREATE OR REPLACE VIEW public.v_horas_projeto_total AS
SELECT
  te.project_id,
  SUM(te.duration_min) / 60.0 AS horas_total,
  SUM(CASE WHEN te.deliverable_id IS NOT NULL THEN te.duration_min ELSE 0 END) / 60.0 AS horas_em_entregaveis
FROM public.time_entries te
WHERE te.project_id IS NOT NULL
GROUP BY te.project_id;

-- ---------- 7. RPC do portal: cliente solicita ajuste (cria alteração) ------
-- Amplia o portal: além de aprovar/reprovar, o cliente pode pedir ajuste,
-- o que cria uma deliverable_alteracao (origem cliente).
CREATE OR REPLACE FUNCTION public.portal_deliverable_alteracao(
  _token text,
  _deliverable_id uuid,
  _titulo text,
  _descricao text,
  _solicitante text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid uuid;
  d_client_id uuid;
  prox_num int;
BEGIN
  SELECT client_id INTO cid
    FROM public.client_portal_tokens
    WHERE token = _token AND ativo = true
      AND (expires_at IS NULL OR expires_at > now());
  IF cid IS NULL THEN
    RETURN jsonb_build_object('error', 'token inválido');
  END IF;

  SELECT p.client_id INTO d_client_id
    FROM public.deliverables d JOIN public.projects p ON p.id = d.project_id
    WHERE d.id = _deliverable_id;
  IF d_client_id IS NULL OR d_client_id <> cid THEN
    RETURN jsonb_build_object('error', 'entregável não pertence ao cliente');
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1 INTO prox_num
    FROM public.deliverable_alteracoes WHERE deliverable_id = _deliverable_id;

  INSERT INTO public.deliverable_alteracoes
    (deliverable_id, numero, titulo, descricao, origem, criado_por)
  VALUES
    (_deliverable_id, prox_num, COALESCE(NULLIF(_titulo,''), 'Ajuste ' || prox_num),
     _descricao, 'cliente', COALESCE(_solicitante, 'cliente'));

  UPDATE public.deliverables
    SET status = 'ajuste_solicitado', updated_at = now()
    WHERE id = _deliverable_id;

  RETURN jsonb_build_object('ok', true, 'numero', prox_num);
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_deliverable_alteracao(text, uuid, text, text, text) TO anon;
