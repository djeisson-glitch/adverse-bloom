# Orçamento único por cliente e mês

## Alteração de 14/10/2026

A migration `20261014140000_orcamento_mensal_unico.sql` substitui a geração mensal por projeto. `budgets.fechamento_mes` identifica a competência com índice único por cliente/mês. O número vem da sequência existente. O valor continua sendo `faturamento_mensal.total`: não recalcula tarifas, impostos, créditos ou cobrança dos contratos.

O orçamento mensal abre em `/orcamentos-mensais/:id`. Projetos são linhas internas de receita alocada e custo total neste fechamento (inclusive despesas/impostos), em `orcamento_mensal_projetos`, sem criar deals. Valores são gerenciais manuais; não se somam automaticamente a custos gerais do projeto, que podem abranger outros meses. Custos não preenchidos ficam pendentes. Rentabilidade geral só aparece quando todas as linhas têm receita/custo e a distribuição fecha em centavos com o total mensal. Pode-se salvar trabalho parcial. Excluir do fee desativa a linha, preservando os valores caso o projeto volte.

A regeneração atualiza o total e os projetos, preserva o número e os lançamentos manuais. Uma revisão bloqueia salvamentos de telas desatualizadas. Leitura/edição de custos exigem permissão financeira por RPC; não há acesso direto à tabela. O editor legado não pode alterar/excluir o orçamento mensal.

`detalhe.orcamento_mensal` contém a referência única. `orcamentos_projetos` continua compatível, com o mesmo número nas linhas mensais; projetos mistos têm referências distintas por modalidade. A tela e o relatório mostram a referência mensal uma única vez. Faturas novas usam esse número inclusive em meses sem projetos. Avulsos/notas separadas seguem a cobrança existente. A mensalidade fixa continua sendo faturada pelo fluxo de contratos, e `faturar_mes` continua emitindo apenas excedentes nesse modelo.

A migração consolida apenas rascunhos/revisados sem fatura. Orçamentos antigos não são apagados nem desvinculados dos projetos. Documentos enviados/faturados preservam suas referências históricas, inclusive se houver mudança posterior de status. Nenhuma alteração é enviada ao Conta Azul.

Validação: build completo, testes de UI/cálculo e PostgreSQL 15 descartável conforme `supabase/tests/orcamento_mensal/README.md`. A fixture SQL é reduzida; não substitui conferir as demais triggers/RLS na publicação real.

## Aplicação do banco em produção — 14/10/2026

Migration aplicada e conferida: seis rascunhos consolidados nos orçamentos #0454–#0459. Comparação antes/depois confirmou os valores dos nove fechamentos, as três faturas, os 152 orçamentos anteriores e os 243 vínculos de projetos preservados. RLS ativa, leitura anônima negada e nenhum custo/receita gerencial inventado. Sicredi Sul Minas, agosto/2026: #0457, R$ 652,29, quatro projetos.

---

## Histórico da implementação anterior (13/10/2026)

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
