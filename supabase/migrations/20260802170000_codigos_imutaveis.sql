-- =========================================================================
-- Código é para sempre: nunca repete, nunca some, nunca muda
--
-- Pedido do Djêisson (02/08/2026): o número do orçamento/projeto e o ADVR do
-- entregável amarram o trabalho ao Drive, à fatura e à conversa com o
-- cliente. Um código que muda — ou que volta a ser usado — sobrescreve
-- história.
--
-- O que faltava:
--   • `projects.numero` não tinha índice único (deals e deliverables tinham);
--   • nada impedia um UPDATE mudando o código, ou zerando pra NULL;
--   • apagar uma linha DEVOLVIA o número: a sequência só garante que ela
--     mesma não repete, mas um insert manual podia reaproveitar o número de
--     um projeto apagado — e aí dois trabalhos diferentes, meses distantes,
--     carregam o mesmo código na pasta do Drive.
--
-- Medido antes de travar: 195 projetos, 7 orçamentos, 353 entregáveis —
-- zero duplicados, zero vazios. Nada a limpar.
--
-- Deletar a LINHA continua permitido (projeto de teste tem que poder sumir).
-- O que não volta é o número: o livro-caixa abaixo guarda todo código já
-- emitido, mesmo depois que a linha morre.
-- =========================================================================

-- ---------- 1. Livro de códigos emitidos ----------
CREATE TABLE IF NOT EXISTS public.codigos_emitidos (
  codigo     text PRIMARY KEY,
  origem     text NOT NULL,                 -- orcamento | projeto | entregavel
  emitido_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.codigos_emitidos IS
  'Todo código já emitido. Sobrevive ao DELETE da linha — é o que garante que um número nunca é reaproveitado.';

ALTER TABLE public.codigos_emitidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "codigos leitura" ON public.codigos_emitidos;
CREATE POLICY "codigos leitura" ON public.codigos_emitidos FOR SELECT TO authenticated USING (true);
-- Escrita só pelos triggers (SECURITY DEFINER). Ninguém edita o livro à mão.

-- Registra o que já está em uso hoje.
INSERT INTO public.codigos_emitidos (codigo, origem)
SELECT numero, 'orcamento' FROM public.deals WHERE numero IS NOT NULL
UNION
SELECT numero, 'projeto' FROM public.projects WHERE numero IS NOT NULL
UNION
SELECT codigo, 'entregavel' FROM public.deliverables WHERE codigo IS NOT NULL
ON CONFLICT (codigo) DO NOTHING;

/**
 * Próximo código livre de uma sequência, registrado no livro.
 *
 * O laço existe pro caso de a sequência esbarrar num número que já foi
 * emitido (linha apagada, backfill antigo, número posto à mão). Em vez de
 * devolver um código repetido, anda pro próximo.
 */
CREATE OR REPLACE FUNCTION public.proximo_codigo(_seq text, _origem text, _prefixo text DEFAULT '')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cand text; n int := 0;
BEGIN
  LOOP
    cand := _prefixo || lpad(nextval(_seq)::text, 4, '0');
    BEGIN
      INSERT INTO public.codigos_emitidos (codigo, origem) VALUES (cand, _origem);
      RETURN cand;
    EXCEPTION WHEN unique_violation THEN
      n := n + 1;
      IF n > 10000 THEN RAISE EXCEPTION 'não achei código livre em %', _seq; END IF;
    END;
  END LOOP;
END;
$$;

-- ---------- 2. Quem emite passa a usar o livro ----------
CREATE OR REPLACE FUNCTION public.tg_deals_numero()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := public.proximo_codigo('public.codigo_adverse_seq', 'orcamento');
  ELSE
    INSERT INTO public.codigos_emitidos (codigo, origem) VALUES (NEW.numero, 'orcamento')
    ON CONFLICT (codigo) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_projects_numero()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _do_orcamento text;
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    -- Veio de orçamento? Usa o número dele — é o mesmo trabalho, e o código
    -- serve justamente pra amarrar orçamento → projeto → entregável → Drive.
    -- Só não herda se OUTRO projeto já tiver esse número (orçamento que virou
    -- projeto duas vezes): aí este ganha um código próprio em vez de estourar
    -- no índice único com uma mensagem que ninguém entende.
    IF NEW.deal_id IS NOT NULL THEN
      SELECT d.numero INTO _do_orcamento FROM public.deals d WHERE d.id = NEW.deal_id;
      IF _do_orcamento IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.numero = _do_orcamento) THEN
        NEW.numero := _do_orcamento;
      END IF;
    END IF;
  END IF;

  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := public.proximo_codigo('public.codigo_adverse_seq', 'projeto');
  ELSE
    INSERT INTO public.codigos_emitidos (codigo, origem) VALUES (NEW.numero, 'projeto')
    ON CONFLICT (codigo) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_deliverables_codigo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := public.proximo_codigo('public.deliverables_advr_seq', 'entregavel', 'ADVR-');
  ELSE
    INSERT INTO public.codigos_emitidos (codigo, origem) VALUES (NEW.codigo, 'entregavel')
    ON CONFLICT (codigo) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- 3. Único e obrigatório ----------
-- projects.numero era o único dos três sem índice único.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_numero ON public.projects (numero);

ALTER TABLE public.deals        ALTER COLUMN numero SET NOT NULL;
ALTER TABLE public.projects     ALTER COLUMN numero SET NOT NULL;
ALTER TABLE public.deliverables ALTER COLUMN codigo SET NOT NULL;

-- ---------- 4. Imutável ----------
/**
 * Código emitido não muda mais — nem pra outro valor, nem pra vazio.
 *
 * Um `UPDATE ... SET numero = ...` distraído (ou uma reimportação) reescreve
 * a chave que liga o job à pasta do Drive e à fatura. Bloqueio no banco, não
 * na tela: são três caminhos de escrita e a tela é só um deles.
 */
CREATE OR REPLACE FUNCTION public.tg_codigo_imutavel()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE col text := TG_ARGV[0]; velho text; novo text;
BEGIN
  velho := to_jsonb(OLD) ->> col;
  novo  := to_jsonb(NEW) ->> col;
  IF velho IS NOT NULL AND novo IS DISTINCT FROM velho THEN
    RAISE EXCEPTION
      'O código (%) não pode ser alterado: era "%", tentaram "%". Ele amarra orçamento, projeto, entregável e a pasta no Drive.',
      col, velho, COALESCE(novo, 'vazio');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_numero_imutavel ON public.deals;
CREATE TRIGGER trg_deals_numero_imutavel
  BEFORE UPDATE OF numero ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_codigo_imutavel('numero');

DROP TRIGGER IF EXISTS trg_projects_numero_imutavel ON public.projects;
CREATE TRIGGER trg_projects_numero_imutavel
  BEFORE UPDATE OF numero ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_codigo_imutavel('numero');

DROP TRIGGER IF EXISTS trg_deliverables_codigo_imutavel ON public.deliverables;
CREATE TRIGGER trg_deliverables_codigo_imutavel
  BEFORE UPDATE OF codigo ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.tg_codigo_imutavel('codigo');

GRANT EXECUTE ON FUNCTION public.proximo_codigo(text, text, text) TO authenticated;
