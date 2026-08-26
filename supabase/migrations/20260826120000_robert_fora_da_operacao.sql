-- Robert saiu da operação (26/08/2026).
--
-- O pedido foi explícito: "manter no sistema sem mexer em nada (só nas
-- sugestões)". Então NADA é apagado — nem horas, nem autoria de comentário,
-- nem candidatura a etapa, nem projeto. O nome dele continua aparecendo em
-- tudo o que ele fez, que é como tem que ser: histórico não se reescreve.
--
-- O que muda é só `ativo`, o campo que o sistema já usava para "quem está na
-- operação". Quem SUGERE gente (etapa de pós, menções, escolha de editor)
-- filtra por ele; quem RESOLVE nome de trabalho passado não filtra.
--
-- Reversível numa linha: ativo = true.
UPDATE public.profiles
   SET ativo = false
 WHERE id = '1c9a3222-c616-46d6-9fc3-8662047ee3e7';
