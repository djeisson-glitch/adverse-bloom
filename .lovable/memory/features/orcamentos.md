Budget module: tables (budget_settings, budgets, budget_items, project_costs), PDF generation with jsPDF, cost management for approved budgets

## Tables
- budget_settings: default markup/tax/commission/bv
- budgets: full budget with calculated totals
- budget_items: line items by category with client_price/supplier_cost
- project_costs: real costs tracked against approved budgets

## Pages
- /orcamentos: listing with tabs (draft/approved/rejected), create/edit form, cost management
- BudgetMarginCard: top 5 approved budgets by margin, shown on Insights page

## Calculations (budgetCalc.ts)
- Items have: days, people_count, unit_price → client_price = days × people_count × unit_price
1. subtotal1 = sum(client_price)
2. markup = subtotal1 * markup%
3. subtotal2 = subtotal1 + markup
4. tax/bv/commission = subtotal2 * respective%
5. total = ceil(subtotal2 + tax + bv + commission + addition - discount)
6. margin = sum(client_price - supplier_cost)

## PDF (generateBudgetPDF.ts)
Uses jsPDF + jspdf-autotable. Dark themed pages: cover, about, method, investment briefing, investment value, não inclui, contato.
