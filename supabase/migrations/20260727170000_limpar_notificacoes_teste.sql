-- =========================================================================
-- Limpeza: notificações do tipo `teste` (botão "Testar" da tela de
-- notificações). Sujeira de diagnóstico, não é evento de trabalho.
--
-- Por que via migration e não pela API: notificacoes tem política de SELECT e
-- de UPDATE, mas NENHUMA de DELETE. O RLS filtra as linhas e o PostgREST
-- responde 204 sem apagar nada — "sucesso" silencioso. De propósito, aliás:
-- notificação é registro, não deve ser removível por quem a recebeu.
-- =========================================================================

DELETE FROM public.notificacoes WHERE tipo = 'teste';
