-- =========================================================================
-- Etapas do projeto: 5 colunas e "acabar" vira ação, não etapa
--
--  Novo conjunto: novo · pre-producao · producao · pos-producao · fechamento.
--
--  Saem "Briefing", "Revisão Cliente", "Entregue" e "Faturado". Os dois
--  últimos eram etapa e marca de arquivo ao mesmo tempo — projeto acabado
--  ocupava coluna do board. Agora finalizar é um botão: o projeto fica em
--  Fechamento o tempo que precisar e só sai quando alguém disser que acabou
--  (status 'finalizado').
--
--  'entregue' e 'faturado' seguem válidos como LEGADO: 174 projetos
--  importados estão assim e continuam na aba Finalizados. Só não são mais
--  oferecidos como etapa.
--
--  Revisão Cliente vira Pós-produção (revisão do cliente acontece em cima do
--  que já foi editado).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.projeto_status_canonico(_s text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE translate(lower(btrim(coalesce(_s, ''))), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc')
    WHEN 'novo'            THEN 'novo'
    WHEN 'novo projeto'    THEN 'novo'
    WHEN 'briefing'        THEN 'novo'
    WHEN 'pre-producao'    THEN 'pre-producao'
    WHEN 'pre producao'    THEN 'pre-producao'
    WHEN 'preproducao'     THEN 'pre-producao'
    WHEN 'producao'        THEN 'producao'
    WHEN 'em producao'     THEN 'producao'
    WHEN 'pos-producao'    THEN 'pos-producao'
    WHEN 'pos producao'    THEN 'pos-producao'
    WHEN 'posproducao'     THEN 'pos-producao'
    -- Revisão do cliente é pós-produção com a bola do lado de lá.
    WHEN 'revisao'         THEN 'pos-producao'
    WHEN 'revisao cliente' THEN 'pos-producao'
    WHEN 'fechamento'      THEN 'fechamento'
    WHEN 'finalizado'      THEN 'finalizado'
    -- Legado de finalizado: continua valendo, só não é mais etapa.
    WHEN 'entregue'        THEN 'entregue'
    WHEN 'faturado'        THEN 'faturado'
    ELSE _s
  END
$$;

-- Move o que ficou com etapa que não existe mais (hoje: os 2 de Revisão
-- Cliente). Quem está entregue/faturado não é tocado.
UPDATE public.projects
   SET status = public.projeto_status_canonico(status)
 WHERE status IS NOT NULL
   AND status IS DISTINCT FROM public.projeto_status_canonico(status);
