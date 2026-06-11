-- Custo hora: horas produtivas/mês da equipe (configurável no Contexto da Empresa).
-- custo hora = custos fixos do mês ÷ horas_produtivas_mes
alter table public.empresa_contexto
  add column if not exists horas_produtivas_mes numeric;
