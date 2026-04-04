1: Two separate CRM pipelines implemented.
2: 
3: ## Commercial Pipeline (Comercial page)
4: Stages: Diagnóstico → Orçamento em elaboração → Proposta enviada → Fechamento → Perdido
5: - Deals start at "diagnostico" 
6: - Moving to "fechamento" triggers WonDealModal with options to create budget + production project
7: - Stage IDs: diagnostico, orcamento, proposta, fechamento, perdido
8: - Won deal cards show "Em Produção" badge with link if project exists
9: 
10: ## Production Pipeline (Projetos/Produção page)  
11: Stages: Briefing → Pré-produção → Em Produção → Revisão Cliente → Entregue → Faturado
12: - Stage IDs: briefing, pre-producao, producao, revisao, entregue, faturado
13: - Projects linked to deals/budgets via deal_id and budget_id columns
14: - Cards show contract_value, delivery_date (with overdue indicator), billing_status badge
15: - Moving to "faturado" triggers invoice confirmation modal
16: - Header KPIs: active projects count, revenue pending, invoiced this month
17: - RPC `create_project_from_budget(budget_id)` creates project from approved budget
18: - View `pipeline_completo` unifies deal → budget → project
19: 
20: ## Conversion flow
21: When deal reaches "fechamento", user can:
22: 1. Create linked budget (navigates to /orcamentos)
23: 2. Convert to production project (creates project in "briefing" status via RPC)
24: 3. Schedule follow-up task
25: 
26: From Orcamentos page:
27: - Approved/sent budgets show "Iniciar Produção" in dropdown menu
28: - Calls RPC create_project_from_budget → navigates to /projetos
29: - If project already exists, shows "Ver Projeto" instead
30: 
31: ## Key files
32: - src/hooks/useProjects.ts - PRODUCTION_STAGES_NEW, useCreateProjectFromBudget
33: - src/components/producao/ProductionKanban.tsx - Production kanban with 6 columns
34: - src/components/comercial/DealCard.tsx - Shows production badge for won deals
35: - src/pages/Projetos.tsx - Produção page with kanban + table + KPIs
36: - src/pages/Orcamentos.tsx - "Iniciar Produção" button in dropdown
37: - src/pages/Home.tsx - "Produção Ativa" section with metrics
38: - src/pages/Comercial.tsx - Commercial pipeline
