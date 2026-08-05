-- =========================================================================
-- Carnaval é a TERÇA — eu tinha errado por um dia
--
-- A migration anterior marcou Páscoa−49 e −48. Conferindo contra o calendário
-- de 2026 (Páscoa em 05/04):
--
--   −49 = 15/02  domingo   ← marcado à toa
--   −48 = 16/02  segunda   ← ok
--   −47 = 17/02  TERÇA     ← O Carnaval. FICOU DE FORA.
--   −46 = 18/02  quarta    Cinzas
--
-- Ou seja: o dia em que ninguém atende telefone continuava valendo como dia
-- útil, e o follow-up podia nascer bem ali. A âncora certa é a Quarta-feira
-- de Cinzas em Páscoa−46; terça é −47 e segunda, −48.
--
-- POR QUE A MEDIÇÃO NÃO PEGOU: ela perguntava "o resultado de
-- proximo_dia_util() é feriado?" usando a MESMA função eh_feriado(). Erro
-- consistente passa em teste consistente. Agora as asserções são contra datas
-- de calendário escritas à mão — as únicas que a função não pode "concordar".
-- =========================================================================

CREATE OR REPLACE FUNCTION public.eh_feriado(_d date)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ano int := EXTRACT(YEAR FROM _d)::int;
  p   date;
BEGIN
  IF to_char(_d, 'MM-DD') IN (
       '01-01', '04-21', '05-01', '09-07', '10-12',
       '11-02', '11-15', '11-20', '12-25'
     ) THEN
    RETURN true;
  END IF;

  -- Móveis: a âncora é a Quarta-feira de Cinzas, em Páscoa−46 (40 dias de
  -- Quaresma + os 6 domingos, que não contam).
  p := public.pascoa(ano);
  IF _d IN (
       p - 48,  -- segunda de Carnaval
       p - 47,  -- TERÇA de Carnaval
       p - 2,   -- Sexta-feira Santa
       p + 60   -- Corpus Christi
     ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.feriados f WHERE f.data = _d);
END $$;

-- ---------------------------------------------------------------- medição
-- Datas conferidas em calendário, não derivadas da própria função.
DO $$
DECLARE
  esperados date[] := ARRAY[
    -- 2026
    '2026-02-16','2026-02-17',  -- Carnaval (seg, TERÇA)
    '2026-04-03',               -- Sexta-feira Santa
    '2026-06-04',               -- Corpus Christi
    '2026-12-25','2026-09-07','2026-11-20',
    -- 2027 (Páscoa 28/03)
    '2027-02-08','2027-02-09',  -- Carnaval
    '2027-03-26',               -- Sexta-feira Santa
    '2027-05-27'                -- Corpus Christi
  ]::date[];
  nao_feriados date[] := ARRAY[
    '2026-02-15',  -- domingo antes do Carnaval: é domingo, não feriado
    '2026-02-18',  -- Quarta-feira de Cinzas: expediente à tarde
    '2026-04-06'   -- segunda depois da Páscoa: dia útil comum
  ]::date[];
  d date;
BEGIN
  FOREACH d IN ARRAY esperados LOOP
    IF NOT public.eh_feriado(d) THEN
      RAISE EXCEPTION 'deveria ser feriado e não é: %', d;
    END IF;
  END LOOP;

  FOREACH d IN ARRAY nao_feriados LOOP
    IF public.eh_feriado(d) THEN
      RAISE EXCEPTION 'NÃO deveria ser feriado: %', d;
    END IF;
  END LOOP;

  -- E o que motivou tudo: 17/02/2026 é terça, e o follow-up tem que pular.
  IF public.proximo_dia_util('2026-02-16'::date) <> '2026-02-18'::date THEN
    RAISE EXCEPTION 'Carnaval não está sendo pulado: % ', public.proximo_dia_util('2026-02-16'::date);
  END IF;

  RAISE NOTICE '% datas de feriado e % de dia útil conferidas contra calendário; Carnaval/2026 pula pra 18/02',
    array_length(esperados,1), array_length(nao_feriados,1);
END $$;
