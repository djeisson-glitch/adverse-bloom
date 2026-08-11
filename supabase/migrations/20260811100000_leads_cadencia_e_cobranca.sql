-- =========================================================================
-- Nutrição de leads: a cadência anda sozinha e o toque do dia cobra
--
-- Djêisson (11/08/2026): "Sem isso, a nutrição morre — foi exatamente o que
-- aconteceu com minha sequência do Apollo, que ficou 25 dias parada porque
-- nada me cobrava."
--
-- Medido antes: 0 leads, 0 interações. O painel existe desde 03/07 e nunca
-- foi usado — e os dois motivos estão no desenho, não na disciplina dele:
--
--   1. `proximo_toque` era uma data manual que NÃO andava. Registrar o toque
--      não mexia nela, então o lead entrava em "atrasado" e não saía mais até
--      alguém editar à mão. Com 40 leads isso vira ruído e o número perde o
--      sentido.
--   2. Nada no sistema lia a tabela `leads`. "Toque atrasado" era um número
--      dentro de /leads: quem não abrisse a tela não era cobrado.
--
-- ------------------------------------------------------------------ 1. cadência
-- A cada interação registrada, o próximo toque avança a partir de HOJE:
--
--      frio → +30 dias    morno → +21 dias    quente → +7 dias
--
-- E a data calculada é só o PADRÃO, nunca uma prisão: o formulário mostra a
-- data já preenchida e editável, e o que for escrito ali vence o cálculo.
-- É a exigência dele, e é a certa — "tem lead que pede pra voltar em
-- novembro, e a cadência automática não cobre isso". Por isso a data
-- escolhida mora na PRÓPRIA interação: além de mandar no lead, fica no
-- histórico o que foi combinado em cada toque.
--
-- Trocar a temperatura também recalcula, a partir de hoje — mas só quando a
-- data não foi mexida na mesma edição. Quem muda os dois de uma vez está
-- dizendo a data que quer, e intenção explícita ganha de regra automática.
--
-- ------------------------------------------------------------- 2. motivo do toque
-- Campo curto ao lado da data, no lead e na interação. Quando o aviso chegar
-- daqui 30 dias, "voltar no Fulano" não diz nada; "perguntar sobre
-- planejamento 2027" faz o toque acontecer.
--
-- --------------------------------------------------------------- 3. a cobrança
-- Tipo `lead_toque` (nível 1, push na hora), UM aviso por pessoa por dia —
-- não um por lead. Vinte leads vencidos num dia devem virar um "20 leads pra
-- tocar", não vinte interrupções: foi essa exata enxurrada que fez o time
-- aprender a ignorar push, e não vou reintroduzi-la pela porta dos leads.
-- O detalhe por lead (nome, empresa, temperatura, dias de atraso, motivo)
-- fica na Minha mesa, que é onde se trabalha a lista.
--
-- Não toco no fluxo de virar orçamento — ele já está certo.
-- =========================================================================

-- ------------------------------------------------------------------ cadência
/**
 * Dias até o próximo toque, por temperatura.
 *
 * Função e não constante espalhada: o trigger da interação, o da temperatura
 * e qualquer tela futura precisam da mesma régua. Temperatura desconhecida
 * cai em 30 (o mais frouxo) — na dúvida, cobrar menos.
 */
CREATE OR REPLACE FUNCTION public.lead_cadencia_dias(_temperatura text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _temperatura
           WHEN 'quente' THEN 7
           WHEN 'morno'  THEN 21
           ELSE 30
         END
$$;

/** Hoje no fuso de Brasília — o servidor é UTC e às 21h já viraria o dia. */
CREATE OR REPLACE FUNCTION public.hoje_br()
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date
$$;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS motivo_toque text;

ALTER TABLE public.lead_interacoes
  ADD COLUMN IF NOT EXISTS proximo_toque date,
  ADD COLUMN IF NOT EXISTS motivo_toque  text;

COMMENT ON COLUMN public.lead_interacoes.proximo_toque IS
  'Data combinada NESTE toque. NULL = usar a cadência da temperatura. '
  'Fica na interação (e não só no lead) pra o histórico guardar o combinado.';

-- ------------------------------------------------- a interação empurra o lead
CREATE OR REPLACE FUNCTION public.tg_lead_interacao_agenda()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.leads l
     SET proximo_toque = COALESCE(
           NEW.proximo_toque,                              -- o que ele escreveu
           public.hoje_br() + public.lead_cadencia_dias(l.temperatura)
         ),
         -- NULL = não veio no formulário, mantém o motivo que já estava.
         -- Texto vazio = ele apagou de propósito, então limpa.
         motivo_toque = CASE
           WHEN NEW.motivo_toque IS NULL THEN l.motivo_toque
           ELSE NULLIF(btrim(NEW.motivo_toque), '')
         END,
         -- Regra que vivia no front: registrar o 1º toque tira do "Novo".
         -- No banco ela vale por qualquer caminho, inclusive importação.
         status = CASE WHEN l.status = 'novo' THEN 'em_nutricao' ELSE l.status END,
         updated_at = now()
   WHERE l.id = NEW.lead_id
     AND l.status NOT IN ('convertido', 'descartado');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_interacao_agenda ON public.lead_interacoes;
CREATE TRIGGER trg_lead_interacao_agenda
  AFTER INSERT ON public.lead_interacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_lead_interacao_agenda();

-- ------------------------------------------ trocar a temperatura reagenda
CREATE OR REPLACE FUNCTION public.tg_lead_temperatura_reagenda()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.temperatura IS DISTINCT FROM OLD.temperatura
     -- Se a data mudou na MESMA edição, ela é a intenção explícita e vence.
     AND NEW.proximo_toque IS NOT DISTINCT FROM OLD.proximo_toque
     AND NEW.status NOT IN ('convertido', 'descartado') THEN
    NEW.proximo_toque := public.hoje_br() + public.lead_cadencia_dias(NEW.temperatura);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_temperatura_reagenda ON public.leads;
CREATE TRIGGER trg_lead_temperatura_reagenda
  BEFORE UPDATE OF temperatura ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_lead_temperatura_reagenda();

-- ------------------------------------------------------------- a cobrança
INSERT INTO public.notificacao_tipos (tipo, rotulo, descricao, grupo, nivel_padrao, ordem) VALUES
  ('lead_toque', 'Lead pra tocar', 'Chegou a data do próximo toque de nutrição', 'comercial', 1, 21)
ON CONFLICT (tipo) DO NOTHING;

/**
 * Um aviso por pessoa por dia com os leads vencidos ou vencendo hoje.
 *
 * Agrupado de propósito (ver cabeçalho). Lead sem responsável cai pros
 * admins — sem isso ele não seria de ninguém, que é como um lead morre.
 */
CREATE OR REPLACE FUNCTION public.notificar_leads_do_dia()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hoje date := public.hoje_br();
  r    record;
BEGIN
  FOR r IN
    WITH vencidos AS (
      SELECT l.id, l.nome, l.empresa, l.proximo_toque, l.responsavel_id
        FROM public.leads l
       WHERE l.proximo_toque IS NOT NULL
         AND l.proximo_toque <= hoje
         AND l.status NOT IN ('convertido', 'descartado')
    ),
    -- Sem responsável = de todos os admins, senão fica sem dono.
    destinos AS (
      SELECT v.*, v.responsavel_id AS quem FROM vencidos v WHERE v.responsavel_id IS NOT NULL
      UNION ALL
      SELECT v.*, p.id AS quem
        FROM vencidos v
        CROSS JOIN public.profiles p
       WHERE v.responsavel_id IS NULL AND public.has_role(p.id, 'admin')
    )
    SELECT d.quem,
           count(*)                                   AS quantos,
           -- uuid não tem min(): pego o primeiro da mesma ordem da lista, que
           -- é o único que interessa (só uso quando é UM lead).
           (array_agg(d.id ORDER BY d.proximo_toque))[1] AS um_id,
           string_agg(
             d.nome || COALESCE(' (' || d.empresa || ')', '') ||
             CASE WHEN d.proximo_toque < hoje
                  THEN ' · ' || (hoje - d.proximo_toque) || 'd atrasado'
                  ELSE ' · hoje' END,
             '; ' ORDER BY d.proximo_toque
           )                                          AS lista
      FROM destinos d
     GROUP BY d.quem
  LOOP
    PERFORM public.notificar(
      r.quem, 'lead_toque', 'importante',
      CASE WHEN r.quantos = 1 THEN '1 lead pra tocar'
           ELSE r.quantos || ' leads pra tocar' END,
      left(r.lista, 180),
      CASE WHEN r.quantos = 1 THEN '/leads/' || r.um_id::text ELSE '/leads' END,
      -- Uma vez por pessoa por dia.
      'lead_toque:' || r.quem::text || ':' || hoje::text
    );
  END LOOP;
END $$;

-- 11h10 UTC = 8h10 de Brasília, logo depois dos prazos (11h00) e antes do
-- digest (11h05 lê o que já entrou). Cron próprio pra dar pra desligar só ele.
DO $$ BEGIN PERFORM cron.unschedule('leads-toque'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'leads-toque',
  '10 11 * * *',
  $job$ SELECT public.notificar_leads_do_dia(); $job$
);

-- ---------------------------------------------------------------- medição
-- Exercita os dois triggers e a cobrança com dado de verdade, dentro de uma
-- subtransação que é DESFEITA — nenhum lead de teste chega a existir.
DO $medicao$
DECLARE _res text; _sobrou int; hoje date := public.hoje_br();
BEGIN
  IF public.lead_cadencia_dias('frio')   <> 30 THEN RAISE EXCEPTION 'cadência do frio errada'; END IF;
  IF public.lead_cadencia_dias('morno')  <> 21 THEN RAISE EXCEPTION 'cadência do morno errada'; END IF;
  IF public.lead_cadencia_dias('quente') <>  7 THEN RAISE EXCEPTION 'cadência do quente errada'; END IF;
  IF public.notif_nivel('lead_toque')    <>  1 THEN RAISE EXCEPTION 'lead_toque não vira push'; END IF;

  BEGIN
    DECLARE
      _l uuid; _dono uuid; _d date; _mot text; _st text; _n int; _tit text;
      _pedido date := hoje + 90;   -- "volta em novembro"
    BEGIN
      SELECT id INTO _dono FROM public.profiles WHERE public.has_role(id, 'admin') LIMIT 1;

      INSERT INTO public.leads (nome, empresa, temperatura, status, responsavel_id)
      VALUES ('__teste_cadencia__', 'Empresa Teste', 'frio', 'novo', _dono)
      RETURNING id INTO _l;

      -- 1) Interação sem data → cadência do frio (+30) e sai de "novo".
      INSERT INTO public.lead_interacoes (lead_id, tipo, descricao, motivo_toque)
      VALUES (_l, 'email', 'primeiro toque', 'perguntar sobre planejamento 2027');
      SELECT proximo_toque, motivo_toque, status INTO _d, _mot, _st FROM public.leads WHERE id = _l;
      IF _d <> hoje + 30 THEN RAISE EXCEPTION 'RESULTADO:cadência do frio não aplicou (deu %)', _d; END IF;
      IF _st <> 'em_nutricao' THEN RAISE EXCEPTION 'RESULTADO:status não saiu de novo (%)', _st; END IF;
      IF _mot <> 'perguntar sobre planejamento 2027' THEN RAISE EXCEPTION 'RESULTADO:motivo não gravou'; END IF;

      -- 2) Interação COM data → a data escrita vence a cadência.
      INSERT INTO public.lead_interacoes (lead_id, tipo, descricao, proximo_toque)
      VALUES (_l, 'ligacao', 'pediu pra voltar depois', _pedido);
      SELECT proximo_toque, motivo_toque INTO _d, _mot FROM public.leads WHERE id = _l;
      IF _d <> _pedido THEN RAISE EXCEPTION 'RESULTADO:a data escolhida foi ignorada (deu %)', _d; END IF;
      IF _mot IS DISTINCT FROM 'perguntar sobre planejamento 2027' THEN
        RAISE EXCEPTION 'RESULTADO:motivo se perdeu quando não veio no formulário';
      END IF;

      -- 3) Trocar a temperatura reagenda a partir de hoje.
      UPDATE public.leads SET temperatura = 'quente' WHERE id = _l;
      SELECT proximo_toque INTO _d FROM public.leads WHERE id = _l;
      IF _d <> hoje + 7 THEN RAISE EXCEPTION 'RESULTADO:trocar temperatura não reagendou (deu %)', _d; END IF;

      -- 4) Mas se a data vier junto na mesma edição, ela ganha.
      UPDATE public.leads SET temperatura = 'morno', proximo_toque = _pedido WHERE id = _l;
      SELECT proximo_toque INTO _d FROM public.leads WHERE id = _l;
      IF _d <> _pedido THEN RAISE EXCEPTION 'RESULTADO:a data explícita perdeu pra regra automática (deu %)', _d; END IF;

      -- 5) Vencido → cobra, uma vez só, nível 1.
      UPDATE public.leads SET proximo_toque = hoje - 3 WHERE id = _l;
      PERFORM public.notificar_leads_do_dia();
      PERFORM public.notificar_leads_do_dia();   -- 2ª chamada não pode duplicar
      SELECT count(*), max(titulo) INTO _n, _tit FROM public.notificacoes
       WHERE user_id = _dono AND tipo = 'lead_toque' AND nivel = 1
         AND dedupe_key = 'lead_toque:' || _dono::text || ':' || hoje::text;
      IF _n <> 1 THEN RAISE EXCEPTION 'RESULTADO:esperava 1 aviso agrupado, veio % (%)', _n, _tit; END IF;

      _res := format('ok · aviso="%s"', _tit);
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res NOT LIKE 'ok ·%' THEN RAISE EXCEPTION 'cadência de leads: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.leads WHERE nome = '__teste_cadencia__';
  IF _sobrou > 0 THEN
    RAISE EXCEPTION 'o lead de teste persistiu (%) — a subtransação não desfez', _sobrou;
  END IF;

  RAISE NOTICE 'leads: cadência anda, data escrita manda, temperatura reagenda e o toque cobra 1x/dia — %', _res;
END $medicao$;
