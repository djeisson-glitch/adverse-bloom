

# Grupos dentro de categorias + Autocomplete de itens pré-cadastrados

## Resumo
Duas melhorias no formulário de orçamento:
1. Permitir criar **grupos** (sub-agrupamentos) dentro de cada categoria para organizar itens visualmente
2. O dropdown de itens pré-cadastrados abre **automaticamente ao digitar**, filtrando por texto, sem precisar clicar na seta

---

## 1. Grupos dentro das categorias

### Conceito
Dentro de uma categoria como PRODUÇÃO, o usuário pode criar grupos (ex: "Equipe Técnica", "Equipe Criativa"). Itens sem grupo aparecem normalmente. Itens com grupo aparecem sob um sub-header com o nome do grupo.

### Banco de dados
- Adicionar coluna `group_name` (text, nullable, default null) na tabela `budget_items`
- Adicionar coluna `group_name` (text, nullable, default null) na tabela `budget_preset_items` (para presets que já venham com grupo)

### Interface
- Botão "Adicionar Grupo" ao lado do botão "Adicionar" no header da categoria
- Ao clicar, prompt para digitar o nome do grupo
- Sub-header visual dentro da categoria com o nome do grupo (estilizado com indentação + label)
- Itens dentro do grupo ficam agrupados visualmente
- Possibilidade de arrastar itens entre grupos (ou remover de grupo)
- Subtotal por grupo exibido no sub-header
- Botão para remover grupo (move itens de volta para "sem grupo")

### Arquivos modificados
- `src/components/budgets/BudgetForm.tsx` — lógica de grupos, renderização de sub-headers, estado de grupos por categoria
- `src/hooks/useBudgets.ts` — incluir `group_name` no tipo `BudgetItem` e nas queries de save/load

---

## 2. Autocomplete ao digitar

### Comportamento atual
O dropdown de presets só aparece quando o campo de nome está vazio E o usuário clica no botão ▼.

### Novo comportamento
- O dropdown abre automaticamente quando o usuário começa a digitar no campo de nome
- Filtra os presets da categoria pelo texto digitado (case-insensitive, substring match)
- Se não houver presets correspondentes, o dropdown não aparece
- Ao selecionar um preset, preenche os dados e fecha o dropdown
- Se o campo ficar vazio e houver presets, mostra todos (comportamento atual mantido)
- Remover a condição `!item.item_name.trim()` que oculta o botão ▼

### Arquivos modificados
- `src/components/budgets/BudgetForm.tsx` — componente `ItemTableRow`: controlar `presetOpen` com base no texto digitado, adicionar filtro por texto

---

## Ordem de implementação
1. Migração DB: adicionar `group_name` em `budget_items` e `budget_preset_items`
2. Atualizar tipos e hooks (`useBudgets.ts`)
3. Implementar autocomplete no `ItemTableRow`
4. Implementar UI de grupos no `BudgetForm`

