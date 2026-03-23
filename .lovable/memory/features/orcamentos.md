Budget module: tables (budget_settings, budgets, budget_items, project_costs, suppliers, proposal_templates, budget_item_suppliers), PDF generation with jsPDF, cost management for approved budgets

## Tables
- budget_settings: default markup/tax/commission/bv + commission split (djeisson/robert percent/enabled)
- budgets: full budget with calculated totals, deal_id (FK deals), not_included (jsonb), version_notes (text)
- budget_items: line items by category with client_price/supplier_cost, has_supplier_cost toggle
- project_costs: real costs tracked against approved budgets
- suppliers: registered suppliers per budget item (name, doc, amount, payment_date, status, sent_to_conta_azul)
- proposal_templates: saved templates with categories, markup/tax/commission/bv defaults, not_included
- budget_item_suppliers: multiple suppliers per budget item (name, unit_price, days, people, total)

## CRM Integration
- budgets.deal_id links to deals table
- Selecting a deal auto-fills client_name and project_name
- URL param ?deal_id= pre-selects deal (from CRM won modal)

## Não Inclui
- budgets.not_included jsonb array of strings
- Collapsible section below categories in BudgetForm
- Shown in Resumo de Entregas panel with "NÃO INCLUI" label
- Default items on new budget: locações externas, alimentação equipe cliente, ajustes pós-aprovação

## Templates (proposal_templates)
- NewBudgetModal: "Em branco" or "Usar template"
- SaveTemplateModal: saves current items/config as reusable template
- Templates store: categories (items), markup/tax/commission/bv defaults, not_included

## Version History
- NewVersionModal: requires "O que mudou?" notes before creating new version
- version_notes shown as tooltip + italic text in version history list

## Approval Flow
- ApprovalModal: option to create linked project on approval
- Project fields: name, start date, delivery date, responsible
- Creates project with status 'em_producao' and sold_value = budget total

## Pages
- /orcamentos: listing with tabs (draft/approved/rejected), create/edit form, cost + supplier management
- /contas-a-pagar: all suppliers table with filters, bulk mark paid, CSV export to Conta Azul
- BudgetMarginCard: top 5 approved budgets by margin, shown on Insights page

## Calculations (budgetCalc.ts)
- Items have dual structure:
  - Client: client_days × client_people × client_unit_price = client_price
  - Supplier: supplier_days × supplier_people × supplier_unit_price = supplier_cost (only if has_supplier_cost=true)
- LOGÍSTICA items: auto-detect subtype by name
  - Alimentação/café/hotel/hospedagem → uses Pessoas field (dias × pessoas × valor)
  - Transporte/uber/carro/estacionamento → no Pessoas (dias × valor)
  - Detection via logisticaNeedsPeople() in BudgetForm.tsx
1. subtotal1 = sum(client_price)
2. markup = subtotal1 * markup%
3. commission = (subtotal1 + markup) * commission% (Jobb formula)
4. subtotal2 = subtotal1 + markup + commission
5. Total = subtotal2 / (1 - bv% - tax%) [recursive calculation]
6. BV = bv% × Total, Tax = tax% × Total
7. totalValue = ceil(Total + addition - discount)
8. marginValue = totalValue - supplierTotal - bvValue - commissionValue (impostos NÃO descontados - custo fixo operacional)
9. marginPercent = marginValue / totalValue * 100
10. supplierTotal = sum(supplier_cost)
- Margin indicators (per item): >=35% green, 15-35% orange, <15% red

## Commission Split
- Djêisson + Robert, each with enabled toggle + individual %
- Total commission = sum of enabled partner percentages
- Stored in budget_settings: commission_djeisson_percent/enabled, commission_robert_percent/enabled
