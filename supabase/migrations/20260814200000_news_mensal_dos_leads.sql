-- =========================================================================
-- A news do mês vira tarefa, todo mês, sozinha
--
-- Djêisson (14/08/2026): "devemos criar também um lembrete/tarefa pra todo mês
-- a gente enviar por e-mail uma news pra essa galera, com algum projeto,
-- movimento do mercado e etc..."
--
-- Isto é nutrição de UM-PRA-MUITOS, diferente do toque individual: o toque é
-- "voltar no Fulano", a news é "aparecer pra base inteira". As duas coisas
-- convivem, e é bom que convivam — quem recebe a news continua recebendo o
-- toque na data dele.
--
-- Todo dia 5, às 8h de Brasília, nasce uma tarefa pro responsável comercial.
-- Dia 5 e não dia 1: dia 1 já tem o rascunho de faturamento e o fechamento do
-- mês, e empilhar a news ali é garantir que ela seja a primeira a ser adiada.
--
-- ------------------------------------------------------------ o atalho útil
-- A descrição da tarefa já traz QUANTOS leads receberiam e QUANTOS estão sem
-- e-mail — o trabalho chato de montar a lista, feito antes de começar. Sem
-- isso a tarefa seria só um post-it, e post-it a gente ignora.
--
-- Não envia e-mail nenhum: o pedido é o LEMBRETE. Disparo em massa é outro
-- problema (domínio, descadastro, bounce) e não se resolve de passagem.
-- =========================================================================

/**
 * Cria a tarefa da news do mês, se ainda não existir.
 *
 * Idempotente pelo título do mês: rodar duas vezes não gera duas tarefas — e
 * `tasks` não tem dedupe próprio, então a checagem é aqui.
 */
CREATE OR REPLACE FUNCTION public.criar_tarefa_news_do_mes()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hoje       date := public.hoje_br();
  ref        text := to_char(hoje, 'MM/YYYY');
  titulo     text := 'News do mês · ' || ref;
  dono       uuid;
  com_email  int;
  sem_email  int;
  _id        uuid;
BEGIN
  SELECT id INTO _id FROM public.tasks WHERE title = titulo LIMIT 1;
  IF _id IS NOT NULL THEN RETURN _id; END IF;

  -- Quem recebe: lead vivo (não convertido, não descartado) com e-mail.
  SELECT count(*) FILTER (WHERE COALESCE(email, '') <> ''),
         count(*) FILTER (WHERE COALESCE(email, '') =  '')
    INTO com_email, sem_email
    FROM public.leads
   WHERE status NOT IN ('convertido', 'descartado');

  -- Vai pro admin: a news é peça de marca, não tarefa de produção.
  SELECT p.id INTO dono FROM public.profiles p
   WHERE public.has_role(p.id, 'admin') ORDER BY p.created_at LIMIT 1;

  INSERT INTO public.tasks (title, description, due_date, assigned_user_id, completed, priority)
  VALUES (
    titulo,
    'Enviar a news pra base de leads: um projeto que saiu, um movimento de mercado, uma ideia.' || E'\n\n' ||
    '· ' || com_email || ' lead(s) com e-mail cadastrado — esses recebem.' || E'\n' ||
    CASE WHEN sem_email > 0
         THEN '· ' || sem_email || ' sem e-mail: completar o cadastro em /leads antes de enviar.' || E'\n'
         ELSE '' END ||
    E'\n' || 'A lista sai em /leads (filtre por status). Depois de enviar, registre como interação nos que responderem.',
    -- Uma semana pra escrever e mandar: prazo curto demais vira tarefa vencida
    -- todo mês, e tarefa cronicamente vencida some do radar.
    hoje + 7,
    dono,
    false,
    'media'
  )
  RETURNING id INTO _id;

  RETURN _id;
END $$;

-- Dia 5, 11h UTC = 8h de Brasília.
DO $$ BEGIN PERFORM cron.unschedule('news-mensal-leads'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'news-mensal-leads',
  '0 11 5 * *',
  $job$ SELECT public.criar_tarefa_news_do_mes(); $job$
);

GRANT EXECUTE ON FUNCTION public.criar_tarefa_news_do_mes() TO authenticated;

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int; _job text;
BEGIN
  SELECT format('%s @ %s ativo=%s', jobname, schedule, active) INTO _job
    FROM cron.job WHERE jobname = 'news-mensal-leads';
  IF _job IS NULL THEN RAISE EXCEPTION 'o cron da news não ficou agendado'; END IF;

  BEGIN
    DECLARE _a uuid; _b uuid; _n int; _desc text; _venc date;
    BEGIN
      _a := public.criar_tarefa_news_do_mes();
      IF _a IS NULL THEN RAISE EXCEPTION 'RESULTADO:não criou a tarefa'; END IF;

      -- Rodar de novo NÃO duplica — é o que protege de duas execuções do cron.
      _b := public.criar_tarefa_news_do_mes();
      IF _b <> _a THEN RAISE EXCEPTION 'RESULTADO:criou uma segunda tarefa no mesmo mês'; END IF;

      SELECT count(*) INTO _n FROM public.tasks
       WHERE title = 'News do mês · ' || to_char(public.hoje_br(), 'MM/YYYY');
      IF _n <> 1 THEN RAISE EXCEPTION 'RESULTADO:ficaram % tarefas do mesmo mês', _n; END IF;

      -- A tarefa tem dono, prazo e a contagem da base — senão é post-it.
      SELECT description, due_date INTO _desc, _venc FROM public.tasks WHERE id = _a;
      IF _desc NOT LIKE '%lead(s) com e-mail%' THEN
        RAISE EXCEPTION 'RESULTADO:a descrição não trouxe a contagem da base';
      END IF;
      IF _venc <> public.hoje_br() + 7 THEN
        RAISE EXCEPTION 'RESULTADO:prazo deu % (esperado hoje+7)', _venc;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = _a AND assigned_user_id IS NOT NULL) THEN
        RAISE EXCEPTION 'RESULTADO:a tarefa nasceu sem dono';
      END IF;

      _res := 'ok';
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res <> 'ok' THEN RAISE EXCEPTION 'news: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.tasks WHERE title LIKE 'News do mês ·%';
  IF _sobrou > 0 THEN RAISE EXCEPTION 'a tarefa de teste persistiu (%)', _sobrou; END IF;

  RAISE NOTICE 'news do mês: cron dia 5 (%), tarefa com dono, prazo de 7 dias e a base contada', _job;
END $medicao$;
