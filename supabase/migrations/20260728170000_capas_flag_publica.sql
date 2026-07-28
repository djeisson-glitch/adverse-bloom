-- A flag usa_capas precisa chegar em QUEM ANEXA a capa — o editor. E clients
-- só é legível pela gestão (20260720140000), então ler a flag de lá deixaria
-- a seção invisível justamente pra quem vai usá-la.
--
-- Vai pra clientes_publico, que existe pra isso: identidade do cliente sem
-- nada de contato/faturamento. Coluna nova só pode ser APENDADA no fim num
-- CREATE OR REPLACE VIEW.
CREATE OR REPLACE VIEW public.clientes_publico AS
  SELECT id, name, trade_name, type, intake_editor_id, usa_capas
  FROM public.clients;

GRANT SELECT ON public.clientes_publico TO authenticated;
