## Deal Projects (deal_projects table)

Deals can contain multiple projects. Each project is an independent unit with: name, delivery_type, value, internal_cost, margin_value, margin_percent.

### Delivery Types
Reels Simples, Reels Complexo, Institucional, Evento, Campanha/Manifesto, Podcast, Motion, Redução, Produção

### Structure
- `deal_projects` table linked to `deals` via `deal_id` (CASCADE delete)
- `budgets.deal_project_id` links each budget to a specific deal project
- Versions/reductions of the same video belong to the same project
- Budget consolidates projects for client view

### Ticket Médio
Calculated per project (receita total ÷ número de deal_projects), not per deal.

### Client Detail
Shows deal projects with delivery_type, value, and margin in the Projetos tab.

### Migration
Existing budgets were migrated as single projects within their corresponding deals.

### Key Files
- src/hooks/useDealProjects.ts - CRUD hook + useAllDealProjects + useDealProjectsByClient
- src/components/budgets/BudgetForm.tsx - Project selector in budget form
- src/components/comercial/Indicadores.tsx - Ticket médio per project
- src/pages/ClienteDetalhe.tsx - Project history tab
