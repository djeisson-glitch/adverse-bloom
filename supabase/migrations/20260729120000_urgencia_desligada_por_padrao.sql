-- A taxa de urgência estava LIGADA por padrão (50% / 1 dia) em todo cliente.
--
-- Errado por dois motivos. O pedido era pro Sul Minas, e eu generalizei. E o
-- padrão certo pra uma regra que COBRA é desligado: cliente novo cadastrado
-- amanhã começaria a levar +50% sem ninguém ter decidido isso — descoberto na
-- fatura, que é o pior lugar.
--
-- Agora nasce desligada. Liga-se por cliente, na ficha.
ALTER TABLE public.clients ALTER COLUMN urgencia_dias SET DEFAULT 0;

COMMENT ON COLUMN public.clients.urgencia_dias IS
  'Janela do adicional em DIAS CORRIDOS. 0 = SEM taxa de urgência (padrão). 1 = entrega hoje ou amanhã é urgente.';

-- Estado combinado: só o Sul Minas cobra.
UPDATE public.clients SET urgencia_dias = 0
 WHERE name ILIKE '%Sicredi Regi%o da Produ%';

UPDATE public.clients SET urgencia_dias = 1, urgencia_percentual = 50
 WHERE name ILIKE '%Sul Minas%';

-- Quem nunca foi configurado fica de fora até alguém decidir.
UPDATE public.clients SET urgencia_dias = 0
 WHERE name NOT ILIKE '%Sul Minas%' AND urgencia_dias IS DISTINCT FROM 0;
