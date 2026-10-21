# Orçamentos com tabela de preços finais

A tabela para novos orçamentos foi publicada em 21/10/2026 (commit `1107188`). Esta versão adiciona a criação de opções com tabela em orçamentos abertos. Não requer IA.

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

## Opção com tabela em orçamento aberto

- Botão **Criar opção com tabela**, junto às alternativas do orçamento, para usuários com acesso financeiro e clientes configurados. O diálogo lista os serviços e permite escolher quantidades, nomear a alternativa e conferir total/base/taxas antes da criação.
- Não há conversão automática entre equipe/horas e pacotes. As quantidades começam em zero; pelo menos um serviço deve ser escolhido. Vídeos usam quantidades inteiras; diárias podem ser fracionadas.
- Reaproveita a raiz e o mecanismo de variantes. A alternativa recebe sua própria planilha, preços editáveis, custos inicialmente zerados, entregas, proposta, condições e recorrência da origem. Nenhum orçamento original ou item original é atualizado.
- Bloqueios no servidor e na interface: orçamento aprovado (inclusive registro histórico), negócio ganho/perdido, fechamento mensal ou alternativa já tabelada. O servidor também verifica permissão, cliente, preços e taxas atuais, com transação atômica.
- Alternativas de uma mesma raiz podem usar regimes diferentes. Duplicar uma alternativa copia o regime dela, sem herdar indevidamente o regime da raiz.
- Migração: `20261021150000_opcao_tabela_orcamento_aberto.sql`. Nenhum orçamento existente foi convertido ou duplicado durante a implementação.

Validação desta extensão: 64 testes frontend passaram, incluindo `OpcaoTabelaCliente.test.tsx`; build isolado com TypeScript e lint de hooks passou. No PostgreSQL descartável, carregar fixture base, `opcao_tabela_fixture.sql`, as duas migrações de 21/10 e executar `orcamentos_tabela_cliente.sql` e `opcao_tabela_cliente.sql`. Testes conferem preservação integral da origem, alternativas com regimes diferentes, aprovação, mensal, preços/taxas desatualizados, quantidades e permissões. Também validado no schema completo, com usuário autenticado e orçamento #467, em transação revertida: original e itens preservados, nova opção, duplicação e bloqueio de aprovação.
