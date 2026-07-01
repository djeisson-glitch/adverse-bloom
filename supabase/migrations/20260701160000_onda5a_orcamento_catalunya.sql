-- =========================================================================
-- Onda 5A · Orçamento Catalunya-style — briefing estruturado, planilha
-- categorizada em 11 blocos padrão de produtora, composição por horas e
-- custos diretos.
-- =========================================================================

-- ---------- 1. Briefing no deal --------------------------------------------
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS canal_entrada text,        -- indicação | inbound | prospecção | agencia | ...
  ADD COLUMN IF NOT EXISTS tipo_orcamento text,       -- geral | filme institucional | campanha | série | reels | ...
  ADD COLUMN IF NOT EXISTS precisa_roteiro text,      -- 'precisa' | 'nao_precisa' | 'ja_tem'
  ADD COLUMN IF NOT EXISTS precisa_elenco text,       -- 'sim' | 'nao'
  ADD COLUMN IF NOT EXISTS local_filmagem text,
  ADD COLUMN IF NOT EXISTS moeda text NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS objetivo text,             -- textarea longo
  ADD COLUMN IF NOT EXISTS formatos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS meios_veiculacao text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verba_estimada numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_proposta numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_final_aprovado numeric(14,2);

-- ---------- 2. Cabeçalho do orçamento (percentuais + totais) --------------
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS margem_produtora_percent numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS direcao_cena_percent numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS imposto_percent numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notas text;

-- ---------- 3. Categorias padrão da planilha (11 blocos de produtora) ------
CREATE TABLE IF NOT EXISTS public.budget_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,         -- 001, 002, ...
  nome text NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  sistema boolean NOT NULL DEFAULT true, -- true = padrão do Adverse, não pode deletar
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.budget_categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budget_categorias select" ON public.budget_categorias;
CREATE POLICY "budget_categorias select" ON public.budget_categorias
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "budget_categorias admin mutations" ON public.budget_categorias;
CREATE POLICY "budget_categorias admin mutations" ON public.budget_categorias
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.budget_categorias (codigo, nome, ordem) VALUES
  ('001', 'PRÉ-PRODUÇÃO',            10),
  ('002', 'TESTE DE VT',              20),
  ('003', 'PRODUÇÃO',                 30),
  ('004', 'TRANSPORTE',               40),
  ('005', 'PASSAGEM E HOSPEDAGEM',    50),
  ('006', 'ELENCO',                   60),
  ('007', 'EQUIPE TÉCNICA',           70),
  ('008', 'EQUIPAMENTOS',             80),
  ('009', 'ALIMENTAÇÃO',              90),
  ('010', 'ARTE / FIGURINO',         100),
  ('011', 'PÓS PRODUÇÃO',            110)
ON CONFLICT (codigo) DO NOTHING;

-- ---------- 4. Itens do orçamento com categoria e observações ------------
ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.budget_categorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ordem int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tira_taxa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS descricao text,             -- override do campo item_name legado
  ADD COLUMN IF NOT EXISTS diaria numeric(12,2);       -- diária/hora (item por unidade)

CREATE INDEX IF NOT EXISTS idx_budget_items_categoria ON public.budget_items (categoria_id, ordem);

-- ---------- 5. Composição por horas (usa rate_card) -----------------------
CREATE TABLE IF NOT EXISTS public.budget_composicao_horas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid REFERENCES public.budgets(id) ON DELETE CASCADE NOT NULL,
  funcao_id uuid REFERENCES public.rate_card(id) ON DELETE SET NULL,
  funcao_nome text NOT NULL,                          -- snapshot do nome
  horas numeric(6,2) NOT NULL DEFAULT 0,
  preco_hora numeric(12,2) NOT NULL DEFAULT 0,
  custo_hora numeric(12,2) NOT NULL DEFAULT 0,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.budget_composicao_horas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budget_horas mutations" ON public.budget_composicao_horas;
CREATE POLICY "budget_horas mutations" ON public.budget_composicao_horas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_budget_composicao_budget ON public.budget_composicao_horas (budget_id);

-- ---------- 6. Custos diretos avulsos (locação, equipamento externo) ------
CREATE TABLE IF NOT EXISTS public.budget_custos_diretos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid REFERENCES public.budgets(id) ON DELETE CASCADE NOT NULL,
  descricao text NOT NULL,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.budget_custos_diretos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budget_custos_diretos mutations" ON public.budget_custos_diretos;
CREATE POLICY "budget_custos_diretos mutations" ON public.budget_custos_diretos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_budget_custos_diretos_budget ON public.budget_custos_diretos (budget_id);

-- ---------- 7. RPC: ganhar orçamento → gerar projeto ----------------------
-- Move o deal pra stage 'aceite' (aciona trigger de follow-up automático) e
-- cria um projeto vinculado com o valor final aprovado.
CREATE OR REPLACE FUNCTION public.ganhar_orcamento_gerar_job(
  _deal_id uuid,
  _valor_final numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d record;
  pid uuid;
  valor numeric;
  cli_name text;
BEGIN
  SELECT d.*, c.name AS client_name INTO d
    FROM public.deals d
    LEFT JOIN public.clients c ON c.id = d.client_id
    WHERE d.id = _deal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal não encontrado';
  END IF;

  valor := COALESCE(_valor_final, d.valor_final_aprovado, d.value, 0);

  -- Atualiza o deal
  UPDATE public.deals
    SET stage = 'aceite',
        valor_final_aprovado = valor,
        value = valor
    WHERE id = _deal_id;

  -- Cria projeto vinculado
  INSERT INTO public.projects (
    name, client_id, client_name, sold_value, status, sold_date,
    deal_id, budget_id
  ) VALUES (
    d.title,
    d.client_id,
    COALESCE(d.client_name, ''),
    valor,
    'aguardando',
    CURRENT_DATE,
    d.id,
    (SELECT id FROM public.budgets WHERE deal_id = d.id ORDER BY created_at DESC LIMIT 1)
  ) RETURNING id INTO pid;

  RETURN pid;
END;
$$;
