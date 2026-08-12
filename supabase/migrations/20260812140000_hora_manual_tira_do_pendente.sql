-- =========================================================================
-- Lançar hora à mão também tira a peça do "pendente"
--
-- Djêisson (12/08/2026): "se eu lançar horas manualmente, o sistema deve
-- contar como editado (igual o comportamento de clicar em play e depois
-- parar)."
--
-- Hoje só o botão move o status: `Editar` põe em `em_edicao` e `Parar` põe
-- em `em_pausa`. Quem trabalhou e apontou depois — que é o caso de quem
-- esquece de ligar o cronômetro — deixava a peça em `Pendente` com horas
-- lançadas nela. Duas afirmações incompatíveis sobre a mesma peça, e a de
-- cima ("ninguém começou") é a que a Minha mesa e o painel do time leem.
--
-- A regra: hora apontada num entregável PENDENTE passa o status pra
-- `em_pausa` — exatamente onde play+parar deixa a peça: o trabalho começou e
-- o cronômetro não está rodando.
--
-- ------------------------------------------------------- o que NÃO acontece
-- Só `pendente` é afetado, e isso é o coração da coisa. Apontar uma hora
-- esquecida numa peça que já está em revisão, com o cliente, aprovada ou
-- entregue NÃO pode puxá-la de volta pra produção: desfaria a aprovação e
-- devolveria a peça pra mesa de alguém por causa de um lançamento
-- retroativo. `pendente` é o único status que significa "ninguém começou", e
-- é o único que essa regra tem o direito de mudar.
--
-- Fica no BANCO e não na tela porque o apontamento entra por vários lugares
-- — o timesheet do entregável, a página de Horas, a correção do admin e
-- qualquer importação futura. Uma tela só resolveria uma delas.
--
-- O caminho do cronômetro não é afetado: quando ele para, a peça já está em
-- `em_edicao`, e o trigger não mexe.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_hora_tira_do_pendente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deliverable_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.duration_min, 0) <= 0 THEN RETURN NEW; END IF;

  UPDATE public.deliverables
     SET status = 'em_pausa', updated_at = now()
   WHERE id = NEW.deliverable_id
     AND status = 'pendente';   -- e SÓ pendente: ver o cabeçalho

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hora_tira_do_pendente ON public.time_entries;
CREATE TRIGGER trg_hora_tira_do_pendente
  AFTER INSERT ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_hora_tira_do_pendente();

-- ---------------------------------------------------------------- medição
DO $medicao$
DECLARE _res text; _sobrou int;
BEGIN
  BEGIN
    DECLARE
      _cli uuid; _p uuid; _pend uuid; _aprov uuid; _edit uuid; _u uuid;
      _s1 text; _s2 text; _s3 text;
    BEGIN
      SELECT id INTO _cli FROM public.clients LIMIT 1;
      SELECT id INTO _u   FROM public.profiles LIMIT 1;

      INSERT INTO public.projects (name, numero, client_id, client_name)
      VALUES ('Teste hora manual', '9998', _cli, '__teste__') RETURNING id INTO _p;

      INSERT INTO public.deliverables (project_id, titulo, codigo, status)
      VALUES (_p, 'Peça pendente', 'ADVR-9997', 'pendente') RETURNING id INTO _pend;
      INSERT INTO public.deliverables (project_id, titulo, codigo, status)
      VALUES (_p, 'Peça aprovada', 'ADVR-9998', 'aprovado') RETURNING id INTO _aprov;
      INSERT INTO public.deliverables (project_id, titulo, codigo, status)
      VALUES (_p, 'Peça em edição', 'ADVR-9999', 'em_edicao') RETURNING id INTO _edit;

      -- 1. Pendente + hora à mão = saiu do pendente, igual play+parar.
      INSERT INTO public.time_entries (user_id, project_id, deliverable_id, start_at, duration_min, source, billable)
      VALUES (_u, _p, _pend, now(), 40, 'manual', true);
      SELECT status INTO _s1 FROM public.deliverables WHERE id = _pend;
      IF _s1 <> 'em_pausa' THEN
        RAISE EXCEPTION 'RESULTADO:pendente não virou em_pausa (%)', _s1;
      END IF;

      -- 2. APROVADA continua aprovada. Esta é a asserção que protege o fluxo:
      --    hora retroativa não desaprova peça.
      INSERT INTO public.time_entries (user_id, project_id, deliverable_id, start_at, duration_min, source, billable)
      VALUES (_u, _p, _aprov, now(), 30, 'manual', true);
      SELECT status INTO _s2 FROM public.deliverables WHERE id = _aprov;
      IF _s2 <> 'aprovado' THEN
        RAISE EXCEPTION 'RESULTADO:hora retroativa regrediu uma peça aprovada (%)', _s2;
      END IF;

      -- 3. Em edição segue em edição — o caminho do cronômetro não muda.
      INSERT INTO public.time_entries (user_id, project_id, deliverable_id, start_at, duration_min, source, billable)
      VALUES (_u, _p, _edit, now(), 15, 'timer', true);
      SELECT status INTO _s3 FROM public.deliverables WHERE id = _edit;
      IF _s3 <> 'em_edicao' THEN
        RAISE EXCEPTION 'RESULTADO:em_edicao virou % no meio do cronômetro', _s3;
      END IF;

      -- 4. Hora de projeto (sem peça) não quebra nem afeta ninguém.
      INSERT INTO public.time_entries (user_id, project_id, deliverable_id, start_at, duration_min, source, billable)
      VALUES (_u, _p, NULL, now(), 25, 'manual', true);

      -- 5. Duração zero/nula não move nada — lançamento vazio não é trabalho.
      UPDATE public.deliverables SET status = 'pendente' WHERE id = _pend;
      INSERT INTO public.time_entries (user_id, project_id, deliverable_id, start_at, duration_min, source, billable)
      VALUES (_u, _p, _pend, now(), 0, 'manual', true);
      SELECT status INTO _s1 FROM public.deliverables WHERE id = _pend;
      IF _s1 <> 'pendente' THEN
        RAISE EXCEPTION 'RESULTADO:lançamento de 0 min mudou o status (%)', _s1;
      END IF;

      _res := 'ok';
      RAISE EXCEPTION 'RESULTADO:%', _res;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'RESULTADO:%' THEN RAISE; END IF;
    _res := substring(SQLERRM from 11);
  END;

  IF _res <> 'ok' THEN RAISE EXCEPTION 'hora manual: %', _res; END IF;

  SELECT count(*) INTO _sobrou FROM public.projects WHERE client_name = '__teste__';
  IF _sobrou > 0 THEN RAISE EXCEPTION 'projeto de teste persistiu (%)', _sobrou; END IF;

  RAISE NOTICE 'hora à mão tira do pendente; peça aprovada e em edição ficam onde estão';
END $medicao$;
