

# Reordenar itens dentro das categorias do orçamento

## Resumo
Adicionar drag-and-drop para reordenar os itens dentro de cada categoria no formulário de orçamento, usando a biblioteca `@hello-pangea/dnd` (fork mantido do react-beautiful-dnd).

## Detalhes técnicos

### 1. Instalar dependência
- `@hello-pangea/dnd` — biblioteca leve de drag-and-drop para listas

### 2. Modificar `src/components/budgets/BudgetForm.tsx`
- Importar `DragDropContext`, `Droppable`, `Draggable` do `@hello-pangea/dnd`
- Envolver cada categoria em um `DragDropContext` + `Droppable`
- Envolver cada linha de item (`ItemTableRow` e `MobileItemRow`) em um `Draggable`
- Adicionar ícone de "grip" (⠿) à esquerda de cada linha para indicar que é arrastável
- Implementar handler `onDragEnd` que reordena os itens no estado `items[]`, atualizando o `order_index` de cada item na categoria afetada
- Desabilitar drag quando o orçamento está aprovado (`isApproved`)

### 3. Ajustes visuais
- Adicionar coluna estreita à esquerda da tabela para o handle de arraste (ícone `GripVertical` do lucide-react)
- Estilo de destaque no item sendo arrastado (sombra + opacidade reduzida no placeholder)

