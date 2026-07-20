-- Prazo com HORÁRIO (opcional). Colunas companheiras de hora — a data continua
-- date, então nada do que já trata prazo como dia (faturamento, calendário,
-- "atrasado") muda. Hora nula = só o dia, como era.
ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS prazo_interno_hora time,
  ADD COLUMN IF NOT EXISTS data_entrega_hora  time;

-- Formulário do cliente: a demanda também guarda a hora desejada.
ALTER TABLE public.demandas
  ADD COLUMN IF NOT EXISTS prazo_desejado_hora time;

COMMENT ON COLUMN public.deliverables.prazo_interno_hora IS 'Horário do prazo interno (comercial: 09:30–12h, 13:30–18h). Nulo = só o dia.';
COMMENT ON COLUMN public.deliverables.data_entrega_hora IS 'Horário do prazo do cliente. Nulo = só o dia.';
