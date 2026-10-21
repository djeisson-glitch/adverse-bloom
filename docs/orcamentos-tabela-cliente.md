# Orçamentos com tabela de preços finais

Implementado localmente; migração e frontend devem ser publicados juntos. Não requer IA.

- Reutiliza `client_precos`. Novos orçamentos recebem cópias dos itens ativos, com quantidade zero para escolha, preço editável e multiplicador 1. Não copia equipe e edição genéricas por cima dos pacotes.
- `client_faturamento.orcamento_taxas_inclusas` é o padrão exclusivo de orçamentos. Inicializado somente para Sicredi Região da Produção (`d3a96591-55b7-4b64-a445-72aaa28eb950`): imposto 12%, margem 37,68%, comissão Djêisson 4%, BV 0%. Os campos usados pelo fechamento mensal não mudam.
- `budgets.precos_finais` registra o regime no momento da criação; variantes o herdam. Orçamentos antigos não são convertidos.
- `client_unit_price` continua sendo o valor final do serviço. A base unitária é calculada; não é salva arredondada para depois reconstruir o preço. Evita perdas de centavos e alterações na tabela. Imposto, margem, BV e comissão saem de dentro do total. Comissões fixas são rateadas proporcionalmente para a exibição por item.
- Preço final, percentuais, comissão, quantidade e custos são editáveis. Alterar taxas recompõe a base sem mudar o preço. Não há arredondamento para múltiplos de R$ 50 neste regime. Salvar como padrão global fica indisponível para não levar essa regra aos demais clientes.
- A criação do orçamento e do catálogo é atômica. Recarregar o catálogo não altera linhas existentes. O total salvo é recalculado no banco ao alterar itens ou grupos ocultos.
- Proposta compartilhada usa as mesmas parcelas e preserva as permissões de visibilidade. Carta simples continua lendo o total salvo.

## Validação

Frontend: `npx vitest run src/lib/precosFinais.test.ts src/lib/bv.test.ts src/lib/rentabilidadeGrupo.test.ts src/lib/resumoPlanilha.test.ts src/pages/OrcamentoEditor.tabela.test.tsx src/pages/OrcamentoEditor.entregas.test.tsx src/pages/OrcamentoEditor.acoes.test.tsx`; build inclui TypeScript e lint de hooks.

Banco: somente num PostgreSQL descartável vazio, carregar `supabase/tests/orcamentos_tabela_fixture.sql`, a migração `20261021120000_orcamentos_tabela_cliente.sql`, a definição vigente de `orcamento_criar_variante` em `20260824140000_orcamento_variantes.sql`, e `supabase/tests/orcamentos_tabela_cliente.sql`. A fixture é mínima e não substitui a validação da migração no schema completo antes de publicar.

Cenário de conferência: criar orçamento do Sicredi Região da Produção, escolher 1 Pílula: total R$ 446,60, base R$ 206,87, imposto R$ 53,59, margem R$ 168,28 e comissão R$ 17,86. Editar preço para R$ 500, reabrir e duplicar: o preço editado deve permanecer. Sicredi Sul Minas e mensal devem manter seu comportamento.
