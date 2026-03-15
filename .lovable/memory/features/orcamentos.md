Budget module: tables (budget_settings, budgets, budget_items, project_costs, suppliers), PDF generation with jsPDF, cost management for approved budgets

## Tables
- budget_settings: default markup/tax/commission/bv + commission split (djeisson/robert percent/enabled)
- budgets: full budget with calculated totals
- budget_items: line items by category with client_price/supplier_cost, has_supplier_cost toggle
- project_costs: real costs tracked against approved budgets
- suppliers: registered suppliers per budget item (name, doc, amount, payment_date, status, sent_to_conta_azul)

## Pages
- /orcamentos: listing with tabs (draft/approved/rejected), create/edit form, cost + supplier management
- /contas-a-pagar: all suppliers table with filters, bulk mark paid, CSV export to Conta Azul
- BudgetMarginCard: top 5 approved budgets by margin, shown on Insights page

## Calculations (budgetCalc.ts)
- Items have dual structure:
  - Client: client_days × client_people × client_unit_price = client_price
  - Supplier: supplier_days × supplier_people × supplier_unit_price = supplier_cost (only if has_supplier_cost=true)
1. subtotal1 = sum(client_price)
2. markup = subtotal1 * markup%
3. subtotal2 = subtotal1 + markup
4. tax/bv/commission = subtotal2 * respective%
5. total = ceil(subtotal2 + tax + bv + commission + addition - discount)
6. margin = sum(client_price - supplier_cost)
7. supplierTotal = sum(supplier_cost)
- Margin indicators (per item): >=35% green, 15-35% orange, <15% red

## Commission Split
- Djêisson + Robert, each with enabled toggle + individual %
- Total commission = sum of enabled partner percentages
- Stored in budget_settings: commission_djeisson_percent/enabled, commission_robert_percent/enabled

## Cost Breakdown (Rentabilidade panel)
- Shows: supplier costs, markup, taxes, BV, commission

## Supplier Management (post-approval)
- Cards per item with has_supplier_cost, register supplier details, track payment status
- CSV export to Conta Azul with sent_to_conta_azul tracking

## PDF (generateBudgetPDF.ts)
Uses jsPDF + jspdf-autotable. Dark themed pages: cover, about, method, investment briefing, investment value, não inclui, contato.
