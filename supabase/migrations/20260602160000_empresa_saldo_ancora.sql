-- Âncora de saldo: o dono informa o saldo REAL em conta numa data, e o sistema
-- calcula o saldo atual = saldo_inicial + (recebido − pago) desde essa data.
-- Substitui a constante hardcoded (R$ 16.307,73 de 2025) que distorcia o caixa.
ALTER TABLE public.empresa_contexto
  ADD COLUMN IF NOT EXISTS saldo_inicial      NUMERIC,
  ADD COLUMN IF NOT EXISTS saldo_inicial_data DATE;
