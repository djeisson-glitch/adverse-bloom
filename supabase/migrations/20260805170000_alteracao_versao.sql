-- =========================================================================
-- Cada alteração do cliente é uma VERSÃO da peça — V1, V2, V3…
--
-- Na prática da ilha a conversa é "manda a V2", "o cliente aprovou a V3".
-- O sistema só tinha `numero` (R1, R2), que é contador de pedido, não nome
-- de versão — e nome de versão é o que a equipe fala em voz alta.
--
-- Texto e não int de propósito: às vezes vira "V2.1" (correção pequena em
-- cima da mesma versão) ou "V2 FINAL". Travar em número obrigaria a inventar
-- outro campo na primeira vez que isso acontecesse.
-- =========================================================================

ALTER TABLE public.deliverable_alteracoes
  ADD COLUMN IF NOT EXISTS versao text;

-- Retroativo: quem já tem histórico ganha o rótulo que já valia na cabeça
-- de todo mundo (a 2ª alteração é a V2).
UPDATE public.deliverable_alteracoes
   SET versao = 'V' || numero
 WHERE versao IS NULL OR btrim(versao) = '';

-- ------------------------------------------------------------------ trigger
-- Reconstruído A PARTIR da definição vigente (20260719201000) — herança de
-- responsável e prazo de 1 dia continuam aqui. CREATE OR REPLACE aceita
-- qualquer corpo calado: escrever de memória já apagou regra em produção
-- neste banco antes.
CREATE OR REPLACE FUNCTION public.alteracao_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Herdar o responsável da edição só faz sentido pra alteração do cliente;
  -- ajuste interno pode ter dono próprio. Mas se vier vazio, herda de qualquer forma.
  IF NEW.responsavel_id IS NULL THEN
    SELECT responsavel_id INTO NEW.responsavel_id
      FROM public.deliverables WHERE id = NEW.deliverable_id;
  END IF;
  -- Prazo curto de propósito: alteração é acerto rápido, não recomeço.
  IF NEW.prazo IS NULL THEN
    NEW.prazo := current_date + 1;
  END IF;
  -- Versão padrão = V<numero>. No banco e não só no app porque o portal do
  -- cliente insere por RPC SECURITY DEFINER: alteração nascida por lá tem
  -- que ganhar versão igual às criadas na tela.
  IF NEW.versao IS NULL OR btrim(NEW.versao) = '' THEN
    NEW.versao := 'V' || COALESCE(NEW.numero, 1);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_alteracao_defaults ON public.deliverable_alteracoes;
CREATE TRIGGER trg_alteracao_defaults
  BEFORE INSERT ON public.deliverable_alteracoes
  FOR EACH ROW EXECUTE FUNCTION public.alteracao_defaults();

-- ---------------------------------------------------------------- medição
DO $$
DECLARE n int; sem int;
BEGIN
  SELECT count(*) INTO n   FROM public.deliverable_alteracoes;
  SELECT count(*) INTO sem FROM public.deliverable_alteracoes WHERE versao IS NULL;
  RAISE NOTICE 'alterações: % | ainda sem versão: %', n, sem;
END $$;
