-- =========================================================================
-- "Cliente aprovou" chegava DUAS VEZES pra mesma pessoa.
--
-- O trigger avisa o responsável e depois a gestão. Cada chamada usava uma
-- chave de dedupe diferente — 'cliaprov:<id>' e 'cliaprovg:<id>' — então quem
-- é as duas coisas (o Djêisson é responsável por peça E é admin) recebia os
-- dois avisos. O índice único é (user_id, dedupe_key): chaves diferentes,
-- nada barrado.
--
-- A chave passa a ser a MESMA nas duas chamadas. Aí o ON CONFLICT DO NOTHING
-- do notificar() faz o trabalho: a segunda tentativa pra mesma pessoa cai
-- fora, e quem está só num dos grupos continua recebendo normal.
--
-- Sufixo por audiência é uma armadilha: parece organizar, mas o que ele faz é
-- desligar a proteção contra repetição justamente pra quem acumula papéis.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_notif_cliente_aprovou()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE proj text; cli text; chave text;
BEGIN
  IF NEW.aprovado_cliente_em IS NULL
     OR (TG_OP = 'UPDATE' AND OLD.aprovado_cliente_em IS NOT DISTINCT FROM NEW.aprovado_cliente_em) THEN
    RETURN NEW;
  END IF;

  SELECT p.name, p.client_name INTO proj, cli
    FROM public.projects p WHERE p.id = NEW.project_id;

  chave := 'cliaprov:' || NEW.id::text;

  PERFORM public.notificar(NEW.responsavel_id, 'cliente_aprovou', 'importante',
    'Cliente aprovou ✅', NEW.titulo || coalesce(' · ' || cli, ''),
    '/projetos/' || NEW.project_id || '/entregaveis/' || NEW.id, chave);
  PERFORM public.notificar_gestao('cliente_aprovou', 'importante',
    'Cliente aprovou ✅', NEW.titulo || coalesce(' · ' || cli, ''),
    '/projetos/' || NEW.project_id || '/entregaveis/' || NEW.id, chave);
  RETURN NEW;
END $$;

-- ---- Faxina das repetidas que já estão na caixa -------------------------
-- Mantém a mais antiga de cada (pessoa, link, tipo) e marca as outras como
-- lidas. Não apaga: o histórico continua lá, só sai do sino.
WITH ranked AS (
  SELECT id, row_number() OVER (
           PARTITION BY user_id, link, tipo ORDER BY created_at
         ) AS n
    FROM public.notificacoes
   WHERE lida_em IS NULL AND link IS NOT NULL
)
UPDATE public.notificacoes n
   SET lida_em = now(), dedupe_key = NULL
  FROM ranked r
 WHERE n.id = r.id AND r.n > 1;
