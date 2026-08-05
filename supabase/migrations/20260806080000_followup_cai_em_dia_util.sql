-- =========================================================================
-- Follow-up automático não cai em sábado, domingo nem feriado
--
--   "o follow up automático nao deve cair em finais de semana e feriados."
--
-- O trigger fazia `CURRENT_DATE + dias` e pronto. Em 60 dias, 2 em cada 7
-- caem no fim de semana — e aí o recontato ou é feito atrasado, ou some da
-- lista de segunda junto com o resto do acúmulo. O follow-up de reaquecimento
-- existe pra ser feito no dia; nascer num sábado é nascer perdido.
--
-- FERIADOS CALCULADOS, não cadastrados. Os nacionais fixos são nove datas, e
-- os móveis (Carnaval, Sexta-feira Santa, Corpus Christi) saem todos da
-- Páscoa. Uma tabela com os feriados de 2027 é uma tabela que alguém esquece
-- de preencher em dezembro de 2026 — e o sistema volta a marcar recontato pra
-- 25/12 sem avisar ninguém.
--
-- A tabela `feriados` existe só pro que NÃO dá pra calcular: feriado
-- municipal, recesso da produtora, ponte de fim de ano.
-- =========================================================================

-- ------------------------------------------------------------- Páscoa
/**
 * Domingo de Páscoa do ano — algoritmo de Meeus/Jones/Butcher (gregoriano).
 *
 * É daqui que saem Carnaval, Sexta-feira Santa e Corpus Christi. IMMUTABLE
 * porque o mesmo ano sempre dá o mesmo dia: o Postgres pode cachear e usar
 * em índice.
 */
CREATE OR REPLACE FUNCTION public.pascoa(_ano int)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int;
        i int; k int; l int; m int; mes int; dia int;
BEGIN
  a := _ano % 19;
  b := _ano / 100;
  c := _ano % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31;
  dia := ((h + l - 7 * m + 114) % 31) + 1;
  RETURN make_date(_ano, mes, dia);
END $$;

-- --------------------------------------------------- feriados que não calculam
CREATE TABLE IF NOT EXISTS public.feriados (
  data date PRIMARY KEY,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'local'      -- local | empresa
);
ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feriados leitura" ON public.feriados;
CREATE POLICY "feriados leitura" ON public.feriados
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "feriados gestao" ON public.feriados;
CREATE POLICY "feriados gestao" ON public.feriados
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

COMMENT ON TABLE public.feriados IS
  'Só o que NÃO dá pra calcular: feriado municipal, recesso da produtora, '
  'ponte. Nacionais (fixos e móveis) saem da função eh_feriado().';

-- ------------------------------------------------------------- é feriado?
/**
 * Feriado nacional (fixo ou móvel) ou data cadastrada em `feriados`.
 *
 * Carnaval e Corpus Christi são ponto facultativo no papel — e dia em que
 * ninguém atende telefone comercial, que é o que importa aqui.
 */
CREATE OR REPLACE FUNCTION public.eh_feriado(_d date)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ano int := EXTRACT(YEAR FROM _d)::int;
  p   date;
BEGIN
  -- Fixos nacionais.
  IF to_char(_d, 'MM-DD') IN (
       '01-01',  -- Confraternização Universal
       '04-21',  -- Tiradentes
       '05-01',  -- Dia do Trabalho
       '09-07',  -- Independência
       '10-12',  -- Nossa Senhora Aparecida
       '11-02',  -- Finados
       '11-15',  -- Proclamação da República
       '11-20',  -- Consciência Negra (nacional desde a Lei 14.759/2023)
       '12-25'   -- Natal
     ) THEN
    RETURN true;
  END IF;

  -- Móveis, todos ancorados na Páscoa.
  p := public.pascoa(ano);
  IF _d IN (
       p - 49,  -- segunda de Carnaval
       p - 48,  -- terça de Carnaval
       p - 2,   -- Sexta-feira Santa
       p + 60   -- Corpus Christi
     ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.feriados f WHERE f.data = _d);
END $$;

-- --------------------------------------------------------- próximo dia útil
/**
 * Empurra a data pra frente até cair em dia útil.
 *
 * Pra frente e nunca pra trás: antecipar encurtaria o intervalo de
 * reaquecimento que a configuração define (60 dias), e um recontato cedo
 * demais é pior que um tarde.
 *
 * O teto de 30 voltas é rede de segurança — se alguém cadastrar um mês
 * inteiro de recesso, a função para em vez de girar pra sempre.
 */
CREATE OR REPLACE FUNCTION public.proximo_dia_util(_d date)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d date := _d;
  voltas int := 0;
BEGIN
  WHILE voltas < 30 AND (
        EXTRACT(ISODOW FROM d) IN (6, 7)   -- sábado, domingo
        OR public.eh_feriado(d)
  ) LOOP
    d := d + 1;
    voltas := voltas + 1;
  END LOOP;
  RETURN d;
END $$;

GRANT EXECUTE ON FUNCTION public.pascoa(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eh_feriado(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proximo_dia_util(date) TO authenticated;

-- ------------------------------------------- trigger passa a usar a regra
-- Reconstruído A PARTIR da definição vigente (20260701130000): muda só a
-- linha da data.
CREATE OR REPLACE FUNCTION public.tg_deal_stage_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg record;
  dias int;
  tipo_fu text;
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage IN ('aceite','perdido') THEN
    SELECT followup_won_days, followup_lost_days INTO cfg
      FROM public.commercial_settings LIMIT 1;

    IF NEW.stage = 'aceite' THEN
      dias := COALESCE(cfg.followup_won_days, 60);
      tipo_fu := 'pos_ganho';
      NEW.won_at := now();
    ELSE
      dias := COALESCE(cfg.followup_lost_days, 60);
      tipo_fu := 'pos_perda';
      NEW.lost_at := now();
    END IF;

    -- Evita duplicar follow-up automático pro mesmo deal+tipo
    IF NOT EXISTS (
      SELECT 1 FROM public.follow_ups
      WHERE deal_id = NEW.id AND tipo = tipo_fu AND status = 'pendente'
    ) THEN
      INSERT INTO public.follow_ups (deal_id, data_prevista, tipo, descricao, responsavel_id)
      VALUES (
        NEW.id,
        -- Aqui: cai em dia útil. Antes era a data crua, e 2 em cada 7
        -- nasciam num fim de semana.
        public.proximo_dia_util((CURRENT_DATE + dias * INTERVAL '1 day')::date),
        tipo_fu,
        CASE WHEN tipo_fu = 'pos_ganho'
             THEN 'Reabordar cliente ' || dias || ' dias após fechamento (upsell/recompra).'
             ELSE 'Reabordar cliente ' || dias || ' dias após perda (reativação).' END,
        NEW.created_by
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_stage_followup ON public.deals;
CREATE TRIGGER trg_deal_stage_followup
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_deal_stage_followup();

-- ---------------------------------------------------------------- medição
DO $$
DECLARE
  d date;
  falhas int := 0;
  pendentes_ruins int;
BEGIN
  -- Um ano inteiro: nenhuma data ajustada pode cair em fim de semana ou feriado.
  FOR d IN SELECT generate_series(CURRENT_DATE, CURRENT_DATE + 365, '1 day')::date LOOP
    IF EXTRACT(ISODOW FROM public.proximo_dia_util(d)) IN (6,7)
       OR public.eh_feriado(public.proximo_dia_util(d)) THEN
      falhas := falhas + 1;
    END IF;
  END LOOP;
  IF falhas > 0 THEN
    RAISE EXCEPTION 'proximo_dia_util devolveu % datas não-úteis em 365', falhas;
  END IF;

  -- Amostra pro log: Páscoa e alguns feriados móveis de 2026 e 2027.
  RAISE NOTICE 'Páscoa 2026: % | Carnaval: % | Sexta Santa: % | Corpus: %',
    public.pascoa(2026), public.pascoa(2026) - 48, public.pascoa(2026) - 2, public.pascoa(2026) + 60;
  RAISE NOTICE 'Páscoa 2027: %', public.pascoa(2027);

  -- Follow-ups pendentes que já estão em dia não-útil: o trigger só cuida dos
  -- próximos. Estes ficam pra decisão de quem cuida da agenda.
  SELECT count(*) INTO pendentes_ruins FROM public.follow_ups
   WHERE status = 'pendente'
     AND (EXTRACT(ISODOW FROM data_prevista) IN (6,7) OR public.eh_feriado(data_prevista));
  RAISE NOTICE '365/365 datas úteis ok | follow-ups pendentes hoje em dia não-útil: %', pendentes_ruins;
END $$;
