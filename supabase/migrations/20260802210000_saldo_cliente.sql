-- =========================================================================
-- Saldo do cliente — o que ele ainda tem A USAR
--
-- Pedido do Djêisson (02/08/2026): registrar se um cliente tem saldo
-- pendente, em três moedas — valor, edições e diárias. Decisão dele: é o que
-- o cliente TEM A USAR (crédito, pacote contratado, franquia que sobrou),
-- não o que ele deve. E é interno: não aparece no portal.
--
-- Por que EXTRATO e não um campo só:
--   Um número solto ("3 edições") não responde de onde veio nem quando
--   entrou. Em três meses ninguém lembra se as 3 são do contrato de junho ou
--   do pacote que ele comprou em março — e aí o saldo vira discussão em vez
--   de resposta. Cada linha tem data e motivo; o saldo é a soma.
--
-- Sinal: positivo ENTRA saldo (contratou, pré-pagou), negativo CONSOME
-- (usou uma diária, gastou o crédito). O saldo nunca deveria ficar negativo
-- — se ficar, é sinal de que o cliente consumiu além do contratado, e isso
-- aparece em vermelho de propósito.
--
-- A baixa é lançada à mão, por enquanto. Baixar sozinho exigiria decidir
-- quais entregas contam, e essa regra não existe ainda.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.client_saldo_lancamentos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  data       date NOT NULL DEFAULT CURRENT_DATE,
  descricao  text NOT NULL,
  valor      numeric(14,2) NOT NULL DEFAULT 0,   -- R$
  edicoes    integer       NOT NULL DEFAULT 0,
  diarias    integer       NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.client_saldo_lancamentos IS
  'Extrato do saldo A USAR do cliente. Positivo entra crédito, negativo consome. Uso interno — não vai pro portal.';

CREATE INDEX IF NOT EXISTS idx_client_saldo_cliente
  ON public.client_saldo_lancamentos (client_id, data DESC);

ALTER TABLE public.client_saldo_lancamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saldo cliente gestao" ON public.client_saldo_lancamentos;
CREATE POLICY "saldo cliente gestao" ON public.client_saldo_lancamentos
  FOR ALL TO authenticated
  USING (public.pode_ver_dinheiro())
  WITH CHECK (public.pode_ver_dinheiro());

/**
 * Saldo consolidado por cliente.
 *
 * `security_invoker` ligado de propósito: sem ele a view roda como dona e
 * ignora a RLS da tabela — foi assim que a `push_alcance` vazou o e-mail do
 * time todo. Aqui vazaria dinheiro de cliente pra quem não pode ver.
 */
CREATE OR REPLACE VIEW public.client_saldo
WITH (security_invoker = on) AS
SELECT
  client_id,
  COALESCE(SUM(valor),   0)::numeric(14,2) AS valor,
  COALESCE(SUM(edicoes), 0)::int           AS edicoes,
  COALESCE(SUM(diarias), 0)::int           AS diarias,
  COUNT(*)::int                            AS lancamentos,
  MAX(data)                                AS ultimo_lancamento
FROM public.client_saldo_lancamentos
GROUP BY client_id;

GRANT SELECT ON public.client_saldo TO authenticated;
