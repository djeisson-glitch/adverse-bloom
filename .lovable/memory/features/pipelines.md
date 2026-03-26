Two separate CRM pipelines implemented.

## Commercial Pipeline (Comercial page)
Stages: Diagnóstico → Orçamento em elaboração → Proposta enviada → Fechamento → Perdido
- Deals start at "diagnostico" 
- Moving to "fechamento" triggers WonDealModal with options to create budget + production project
- Stage IDs: diagnostico, orcamento, proposta, fechamento, perdido

## Production Pipeline (Projetos/Produção page)  
Stages: Pré-produção → Captação → Pós-produção → Aprovação do cliente → Encerrado
- Uses kanban board (ProductionKanban component) with drag-and-drop
- Projects created from deals at fechamento or manually
- Also has table view tab

## Conversion flow
When deal reaches "fechamento", user can:
1. Create linked budget (navigates to /orcamentos)
2. Convert to production project (creates project in "Pré-produção" status)
3. Schedule follow-up task

## Key files
- src/hooks/useDeals.ts - STAGES constant
- src/components/producao/ProductionKanban.tsx - Production kanban
- src/components/comercial/WonDealModal.tsx - Fechamento modal (createBudget + createProject)
- src/pages/Projetos.tsx - Produção page with kanban + table
- src/pages/Comercial.tsx - Commercial pipeline
