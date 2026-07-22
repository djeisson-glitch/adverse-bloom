-- =========================================================================
-- Status do projeto sempre no ID da etapa (nunca no rótulo)
--
--  O board filtra por `p.status === stage.id`. Uma demanda virada em projeto
--  gravava o RÓTULO ("Pré-produção") em vez do id ("pre-producao"): o projeto
--  não caía em coluna nenhuma e sumia da lista de Projetos. Dava pra abrir
--  pelo link direto — existia, só não aparecia em lugar nenhum.
--
--  Corrigir só a tela que errou não resolve a classe: import, edge function e
--  qualquer tela nova podem gravar o rótulo de novo. O banco passa a
--  normalizar na entrada — quem escrever "Pré-produção", "Em Produção" ou
--  "Revisão Cliente" tem o valor convertido pro id antes de gravar.
--
--  Valor desconhecido NÃO é inventado: passa como veio. Sumir por causa de um
--  chute do banco seria trocar um problema silencioso por outro.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.projeto_status_canonico(_s text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE translate(lower(btrim(coalesce(_s, ''))), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc')
    WHEN 'briefing'        THEN 'briefing'
    WHEN 'pre-producao'    THEN 'pre-producao'
    WHEN 'pre producao'    THEN 'pre-producao'
    WHEN 'preproducao'     THEN 'pre-producao'
    WHEN 'producao'        THEN 'producao'
    WHEN 'em producao'     THEN 'producao'
    WHEN 'revisao'         THEN 'revisao'
    WHEN 'revisao cliente' THEN 'revisao'
    WHEN 'entregue'        THEN 'entregue'
    WHEN 'faturado'        THEN 'faturado'
    ELSE _s
  END
$$;

CREATE OR REPLACE FUNCTION public.tg_projeto_status_canonico()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.status := public.projeto_status_canonico(NEW.status);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_status_canonico ON public.projects;
CREATE TRIGGER trg_projects_status_canonico
  BEFORE INSERT OR UPDATE OF status ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_projeto_status_canonico();

-- Conserta o que já está gravado errado (hoje: 1 projeto, o que veio do
-- portal do cliente). Só toca em linha que muda de valor.
UPDATE public.projects
   SET status = public.projeto_status_canonico(status)
 WHERE status IS NOT NULL
   AND status IS DISTINCT FROM public.projeto_status_canonico(status);
