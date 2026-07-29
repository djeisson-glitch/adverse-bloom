-- =========================================================================
-- Adicional de urgência — regra por DIA CORRIDO.
--
-- Djêisson descartou duas alternativas, com razão:
--  • contar HORAS ÚTEIS esticava demais (pedir 19h em vez de 18h ainda seria
--    urgente por quase três dias);
--  • usar a fila do sistema ("pediu antes do que a gente comporta") obriga a
--    defender um cálculo interno na frente do cliente.
--
-- A regra que sobra é a que ele consegue explicar numa frase e o cliente
-- consegue conferir sozinho:
--
--     ENTREGA HOJE OU AMANHÃ  →  +50%
--
-- É por DIA, não por hora — e é isso que fecha o furo que ele levantou:
-- trocar 18h por 19h não muda nada, é o mesmo dia. Pra escapar, o cliente
-- precisa jogar pra depois de amanhã, que é dar um dia de verdade.
--
-- O percentual e a janela ficam por cliente: contrato muda, e ninguém vai
-- lembrar de procurar um 50 chumbado dentro de uma função.
-- =========================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS urgencia_percentual numeric(5,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS urgencia_dias int NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.clients.urgencia_dias IS
  'Janela do adicional em DIAS CORRIDOS. 1 = entrega hoje ou amanhã é urgente. 0 desliga a regra.';
COMMENT ON COLUMN public.clients.urgencia_percentual IS
  'Adicional cobrado quando a entrega cai dentro da janela de urgência.';

-- Congela no PEDIDO. A decisão tem que ficar registrada no ato, com o cliente
-- vendo o banner — e não recalculada depois por um sistema que mudou de
-- opinião. Sem isso ninguém consegue explicar de onde veio o número na fatura.
ALTER TABLE public.demandas
  ADD COLUMN IF NOT EXISTS urgente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS urgencia_percentual numeric(5,2);

COMMENT ON COLUMN public.demandas.urgente IS
  'Congelado no envio: a entrega pedida caía na janela de urgência do cliente.';

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS urgente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS urgencia_percentual numeric(5,2);

/**
 * A entrega pedida é urgente pra este cliente?
 *
 * Compara DATAS no fuso de São Paulo — hora nenhuma entra na conta, de
 * propósito.
 */
CREATE OR REPLACE FUNCTION public.intake_e_urgente(_client_id uuid, _prazo timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _prazo IS NOT NULL
     AND c.urgencia_dias > 0
     AND (timezone('America/Sao_Paulo', _prazo))::date
         <= ((now() AT TIME ZONE 'America/Sao_Paulo')::date + c.urgencia_dias)
    FROM public.clients c WHERE c.id = _client_id
$$;

GRANT EXECUTE ON FUNCTION public.intake_e_urgente(uuid, timestamptz) TO anon, authenticated;
