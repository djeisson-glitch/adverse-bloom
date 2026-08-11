-- =========================================================================
-- Renomear projeto: pode, nos primeiros 30 minutos
--
-- Djêisson (11/08/2026): "falando em renomear: nao tem essa opção hoje...
-- acho que podemos deixar com 30 min de tolerância entre a criação pra editar
-- o nome (assim evita que alguém tenha iniciado com o nome antigo)."
--
-- Ele está certo nas duas partes. Eu afirmei duas vezes que "renomear é um
-- clique na ficha" — não é: o nome do projeto é texto puro no header, sem
-- caminho nenhum de edição. Nunca houve.
--
-- E o raciocínio da janela é o certo: o nome do projeto vira pasta no Drive,
-- timeline no DaVinci e assunto de e-mail. Renomear depois que o trabalho
-- começou não conserta nada — só cria duas verdades, uma no sistema e outra
-- no HD de quem já baixou. Nos primeiros 30 minutos ninguém começou ainda, e
-- é justamente a janela em que o erro de digitação aparece.
--
-- ONDE A TRAVA MORA: no banco. A tela esconde o botão depois dos 30 min, mas
-- esconder botão não é impedir — a API está aberta pra quem tem sessão.
--
-- DUAS PORTAS DE SAÍDA, ambas deliberadas:
--
--   · ADMIN passa depois da janela. Sem isso, um erro grave descoberto no dia
--     seguinte ficaria gravado pra sempre, e a regra existe pra proteger o
--     trabalho — não pra imortalizar engano. A tela avisa, quando é esse o
--     caso, que a pasta provavelmente já existe com o nome antigo.
--   · SEM USUÁRIO (migration, cron, edge function) passa. É manutenção
--     nossa, roda com intenção explícita, e travar isso significaria não
--     conseguir corrigir dado em massa depois — inclusive os 18 projetos que
--     ficaram com o nome destruído.
--
-- O prefixo [XXXX] é reaplicado no rename como é no insert: o código amarra
-- projeto → entregável → pasta, e o número é imutável desde 02/08. Quem
-- renomear pra "Nome novo" continua com [0318] na frente.
-- =========================================================================

/** A janela, num lugar só — a tela lê daqui pra dizer quanto falta. */
CREATE OR REPLACE FUNCTION public.janela_renomear_minutos()
RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 30 $$;

GRANT EXECUTE ON FUNCTION public.janela_renomear_minutos() TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_projects_rename()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  quem     uuid := auth.uid();
  minutos  int  := public.janela_renomear_minutos();
  passou   boolean;
  nome     text;
BEGIN
  IF NEW.name IS NOT DISTINCT FROM OLD.name THEN RETURN NEW; END IF;

  passou := OLD.created_at < now() - make_interval(mins => minutos);

  -- `quem IS NULL` = manutenção nossa (migration/cron/edge), não usuário.
  IF passou AND quem IS NOT NULL AND NOT public.has_role(quem, 'admin') THEN
    RAISE EXCEPTION
      'O nome do projeto só pode ser mudado nos primeiros % minutos. Este foi criado em % — a essa altura a pasta e os arquivos já podem estar com o nome antigo. Fale com um admin.',
      minutos, to_char(OLD.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  END IF;

  -- Mantém o código na frente, igual ao insert.
  nome := btrim(COALESCE(NEW.name, ''));
  IF nome = '' THEN
    RAISE EXCEPTION 'O projeto precisa de um nome.';
  END IF;

  IF NEW.clickup_task_id IS NULL AND nome !~ '^\[[0-9]{4}\]' THEN
    nome := '[' || COALESCE(NEW.numero, OLD.numero, '0000') || '] ' || nome;
  END IF;

  NEW.name := nome;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_projects_rename ON public.projects;
CREATE TRIGGER trg_projects_rename
  BEFORE UPDATE OF name ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_projects_rename();

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int;
BEGIN
  IF public.janela_renomear_minutos() <> 30 THEN RAISE EXCEPTION 'janela mudou sem querer'; END IF;

  BEGIN
    DECLARE
      _cli uuid; _p uuid; _nome text; _cru text; _travou boolean := false;
    BEGIN
      SELECT id INTO _cli FROM public.clients LIMIT 1;

      -- Número fixo: nextval não volta com rollback.
      INSERT INTO public.projects (name, numero, client_id, client_name)
      VALUES ('Nome errado', '9998', _cli, '__teste__')
      RETURNING id INTO _p;

      -- 1. Recém-criado: renomeia, e o código continua na frente.
      UPDATE public.projects SET name = 'Litros de vantagem' WHERE id = _p;
      SELECT name, nome_padrao INTO _nome, _cru FROM public.projects WHERE id = _p;
      IF _nome <> '[9998] Litros de vantagem' THEN
        RAISE EXCEPTION 'RESULTADO:rename perdeu o código: %', _nome;
      END IF;
      -- 2. E o nome padrão acompanha (coluna gerada recalcula no UPDATE).
      IF _cru <> '[9998][LITROS_DE_VANTAGEM]' THEN
        RAISE EXCEPTION 'RESULTADO:nome_padrao não acompanhou: %', _cru;
      END IF;

      -- 3. Renomear pra um nome que JÁ traz o prefixo não duplica o código.
      UPDATE public.projects SET name = '[9998] Outro nome' WHERE id = _p;
      SELECT name INTO _nome FROM public.projects WHERE id = _p;
      IF _nome <> '[9998] Outro nome' THEN
        RAISE EXCEPTION 'RESULTADO:prefixo duplicado: %', _nome;
      END IF;

      -- 4. Nome vazio é recusado.
      BEGIN
        UPDATE public.projects SET name = '   ' WHERE id = _p;
        RAISE EXCEPTION 'RESULTADO:aceitou nome vazio';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'RESULTADO:%' THEN RAISE; END IF;
      END;

      -- 5. Passada a janela, trava pra quem NÃO é admin. Aqui auth.uid() é
      --    NULL (contexto de migration), que é a porta de manutenção — então
      --    o teste do bloqueio chama a regra diretamente com o relógio
      --    envelhecido, que é o que o trigger avalia.
      UPDATE public.projects SET created_at = now() - interval '2 hours' WHERE id = _p;
      SELECT (created_at < now() - make_interval(mins => public.janela_renomear_minutos()))
        INTO _travou FROM public.projects WHERE id = _p;
      IF NOT _travou THEN
        RAISE EXCEPTION 'RESULTADO:a janela não fechou depois de 2 horas';
      END IF;

      -- 6. ...e a manutenção (sem usuário) continua passando, que é o que
      --    permite corrigir os 18 projetos antigos um dia.
      UPDATE public.projects SET name = 'Corrigido pela manutenção' WHERE id = _p;
      SELECT name INTO _nome FROM public.projects WHERE id = _p;
      IF _nome <> '[9998] Corrigido pela manutenção' THEN
        RAISE EXCEPTION 'RESULTADO:manutenção ficou travada: %', _nome;
      END IF;

      _res := format('ok · %s', _cru);
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res NOT LIKE 'ok ·%' THEN RAISE EXCEPTION 'renomear: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.projects WHERE client_name = '__teste__';
  IF _sobrou > 0 THEN RAISE EXCEPTION 'projeto de teste persistiu (%)', _sobrou; END IF;

  RAISE NOTICE 'renomear dentro da janela, código preservado, manutenção livre — %', _res;
END $medicao$;
