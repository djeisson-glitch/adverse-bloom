# Orçamentos dos projetos nos fechamentos

Migrations `20261013200000_orcamentos_fechamento.sql` e `20261013200100_backfill_orcamentos_sicredi.sql` aplicadas em produção em 13/10/2026. Nenhum secret de IA é necessário. O frontend desta alteração usa as referências geradas por elas.

Cada projeto com cliente recebe um orçamento real numerado pela sequência existente. Reutiliza o orçamento vinculado ou um principal inequívoco do deal; não deduz vínculos pelo nome nem cria outro se houver versões ambíguas. O retroativo da migration `20261013200100_backfill_orcamentos_sicredi.sql` cobre somente os dois clientes Sicredi autorizados. Não renumera códigos antigos.

Projetos sem deal recebem um orçamento de referência, disponível pelo cadastro legado, sem gerar oportunidade/venda fictícia no CRM. Guarda a modalidade e configuração do cliente; valor começa a apurar (total 0, com aviso). A cobrança efetiva continua no fechamento existente: não cria preço fechado, aprovação, nova nota nem replica fee por projeto. Orçamentos comerciais já preenchidos permanecem intactos.

O fechamento guarda `detalhe.orcamentos_projetos`, com IDs, números e baldes. Peças/horas seguem criação efetiva; diárias seguem a data da captação, mesmo em projeto antigo. Novos fechamentos e rascunhos regerados preparam automaticamente as referências. Documentos enviados/faturados congelam o snapshot. O backfill adiciona referências históricas sem recalcular totais ou alterar faturas/documentos já emitidos.

Na tela, referências por nota têm botão de copiar para NF/boleto/Conta Azul. A carta mensal inclui só referências do balde mensal; novas faturas mensais levam esses números na descrição. Não emite nem altera documentos diretamente no Conta Azul. Notas avulsas/separadas têm listas próprias para copiar e não entram na descrição da nota mensal.

## Validação

- `npm run build`
- `npm exec vitest run src/lib/orcamentosFechamento.test.ts src/lib/fechamentoCliente.test.ts src/lib/fechamentoFila.test.ts` (27 testes)
- PostgreSQL 15 descartável: `supabase/tests/orcamentos_fechamento/schema.sql`, as duas migrations, `check.sql`, com `ON_ERROR_STOP=1`. Nunca aplicar o schema de teste em banco existente.
- Teste com duas conexões simultâneas confirmou um único orçamento por projeto.
- Antes da aplicação em produção: conferir projetos com budget de outro cliente e deals com múltiplas versões sem vínculo explícito; a migration aborta com mensagem nestes casos, em vez de adivinhar.

## Aplicação em produção — 13/10/2026

Sicredi Região da Produção: 56 projetos numerados. Sicredi Sul Minas: 67 projetos numerados. Foram criados 122 orçamentos, preservado 1 existente e preenchidas referências em 9 fechamentos. Comparação antes/depois confirmou preservação de valores e faturas e integridade dos demais clientes.
