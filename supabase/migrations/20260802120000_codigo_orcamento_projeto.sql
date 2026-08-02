-- =========================================================================
-- Um código só, do orçamento até o projeto
--
-- Decisão do Djêisson (02/08/2026): o título do orçamento passa a nascer com
-- o NÚMERO na frente — o mesmo número que depois vai pro nome do projeto.
-- Até aqui eram duas sequências independentes: o orçamento 0010 virava o
-- projeto 0226. O código não amarrava nada, que era justamente a intenção
-- declarada quando o formato [XXXX]_NOME foi criado (migration 20260726180000).
--
-- Três mudanças:
--   1. UMA sequência para orçamento e projeto. Começa acima do maior número
--      já usado dos dois lados, pra nunca colidir com o acervo do ClickUp.
--   2. Projeto criado a partir de um orçamento HERDA o número dele.
--   3. Título do orçamento carimbado por trigger, como já é no projeto —
--      são três caminhos de criação, tratar um por um deixaria os outros fora.
--
-- O acervo não se mexe: orçamento e projeto já existentes ficam com o número
-- e o título que têm.
-- =========================================================================

-- ---------- 1. Uma sequência só ----------
CREATE SEQUENCE IF NOT EXISTS public.codigo_adverse_seq START 300;

-- Posiciona acima do maior número em uso nos DOIS lados. Sem isso, um
-- orçamento novo herdaria um número que já é de um projeto importado.
DO $$
DECLARE m int;
BEGIN
  SELECT GREATEST(
    COALESCE((SELECT max(numero::int) FROM public.projects WHERE numero ~ '^[0-9]+$'), 0),
    COALESCE((SELECT max(numero::int) FROM public.deals    WHERE numero ~ '^[0-9]+$'), 0),
    299
  ) INTO m;
  PERFORM setval('public.codigo_adverse_seq', m + 1, false);
END $$;

CREATE OR REPLACE FUNCTION public.tg_deals_numero()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := lpad(nextval('public.codigo_adverse_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- 2. Projeto herda o número do orçamento ----------
CREATE OR REPLACE FUNCTION public.tg_projects_numero()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NOT NULL AND NEW.numero <> '' THEN RETURN NEW; END IF;

  -- Veio de orçamento? Usa o número dele — é o mesmo trabalho, e o código
  -- serve justamente pra amarrar orçamento → projeto → entregável → Drive.
  IF NEW.deal_id IS NOT NULL THEN
    SELECT d.numero INTO NEW.numero FROM public.deals d WHERE d.id = NEW.deal_id;
  END IF;

  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := lpad(nextval('public.codigo_adverse_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- 3. Título do orçamento: [XXXX]_NOME_DO_PROJETO ----------
/**
 * Mesma regra do projeto, e de propósito: o orçamento vira projeto com o
 * título inalterado, e os dois têm que sair iguais.
 *
 * O prefixo antigo era digitado à mão — "[CETRUS] Captação material médico".
 * A limpeza tira QUALQUER coisa entre colchetes no começo, então tanto o
 * hábito antigo quanto um [0300]_ recarimbado somem antes de compor.
 */
CREATE OR REPLACE FUNCTION public.tg_deals_titulo()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base text;
BEGIN
  base := public.normalizar_nome_projeto(
            regexp_replace(COALESCE(NEW.title, ''), '^\s*\[[^\]]*\]\s*_?\s*', '')
          );
  IF base IS NULL THEN RETURN NEW; END IF;   -- sem nome, não inventa
  NEW.title := '[' || COALESCE(NEW.numero, '0000') || ']_' || base;
  RETURN NEW;
END;
$$;

-- "numero" < "titulo" na ordem alfabética, que é a ordem em que o Postgres
-- roda triggers BEFORE INSERT — o número já está carimbado aqui.
DROP TRIGGER IF EXISTS trg_deals_titulo ON public.deals;
CREATE TRIGGER trg_deals_titulo
  BEFORE INSERT OR UPDATE OF title ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_deals_titulo();

-- =========================================================================
-- Apagar um faturamento gerado por engano
--
-- A RLS já permitia (policy FOR ALL pra quem vê dinheiro), mas não havia
-- botão. Falta a trava que importa: fechamento que JÁ virou fatura não pode
-- sumir, senão a invoice fica órfã e o mês parece nunca ter fechado.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_faturamento_mensal_del()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este fechamento já virou fatura — cancele a fatura antes de apagar.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_faturamento_mensal_del ON public.faturamento_mensal;
CREATE TRIGGER trg_faturamento_mensal_del
  BEFORE DELETE ON public.faturamento_mensal
  FOR EACH ROW EXECUTE FUNCTION public.tg_faturamento_mensal_del();
