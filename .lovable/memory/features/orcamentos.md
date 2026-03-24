Budget module: tables (budget_settings, budgets, budget_items, project_costs, suppliers, proposal_templates, budget_item_suppliers, budget_preset_items), PDF generation with jsPDF, cost management for approved budgets

## Tables
- budget_settings: default markup/tax/commission/bv + commission split (djeisson/robert percent/enabled)
- budgets: full budget with calculated totals, deal_id (FK deals), not_included (jsonb), version_notes (text)
- budget_items: line items by category with client_price/supplier_cost, has_supplier_cost toggle
- project_costs: real costs tracked against approved budgets
- suppliers: registered suppliers per budget item (name, doc, amount, payment_date, status, sent_to_conta_azul)
- proposal_templates: saved templates with categories, markup/tax/commission/bv defaults, not_included
- budget_item_suppliers: multiple suppliers per budget item (name, unit_price, days, people, total)
- budget_preset_items: reusable items with category, name, default client/supplier values

## Clients
- clients table has: name (razão social), trade_name (nome fantasia), company, email, phone, segment, origin, type
- Display trade_name preferentially in listings and dropdowns, falling back to name
- Filter by type='cliente' to exclude suppliers

## CRM Integration
- budgets.deal_id links to deals table
- Selecting a deal auto-fills client_name and project_name
- URL param ?deal_id= pre-selects deal (from CRM won modal)

## Templates (proposal_templates)
- NewBudgetModal: "Em branco" or "Usar template"
- SaveTemplateModal: saves current items/config as reusable template
- Templates store: categories (items), markup/tax/commission/bv defaults, not_included
- initialTemplate prop on BudgetForm loads template items on creation

## Preset Items (budget_preset_items)
- Managed in ConfiguracoesOrcamentos settings page
- Dropdown appears in empty item rows to quick-fill from presets
- Pre-fills name, client_unit_price, supplier values

## Autosave
- Debounced 2 seconds after any change to items/config
- Only activates after first manual save (when savedBudgetId exists)
- Does not autosave approved budgets

## Auto-add Row
- When filling client_unit_price > 0 on the last item of a category, auto-adds empty row below

## Calculations (budgetCalc.ts)
- Items have dual structure:
  - Client: client_days × client_people × client_unit_price = client_price
  - Supplier: supplier_days × supplier_people × supplier_unit_price = supplier_cost (only if has_supplier_cost=true)
- LOGÍSTICA items: auto-detect subtype by name
- Margin indicators (per item): >=35% green, 15-35% orange, <15% red

## CostReportTab
- Economia/Estouro calculated against subtotal1 (sum of client_price), NOT supplierTotal

## Pages
- /orcamentos: listing with tabs (draft/approved/rejected), create/edit form, cost + supplier management
- /contas-a-pagar: all suppliers table with filters, bulk mark paid, CSV export to Conta Azul
