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

## Resumo de Entregas
- EQUIPE (PRODUÇÃO): groups by name, shows Nx nome (Y diár.)
- PÓS-PRODUÇÃO: each item with hours
- LOGÍSTICA: each item with dias (+ pessoas if alimentação/hospedagem)
- Totals: only PRODUÇÃO diárias + PÓS horas (no logística total)

## Inline Add (spreadsheet-style)
- [+ Adicionar] inserts empty row at bottom of category table
- Tab/Enter to navigate, Enter on last field saves + adds new row
- Escape cancels empty row

## Cost Entry (CostEntryTab)
- Orçado = subtotal_1 (Sub-Total 1, what charges client)
- Executado = sum of project_costs amounts
- Progressive alerts: >70% yellow, >90% red, >100% critical with loss amount

## PDF (generateBudgetPDF.ts)
Uses jsPDF + jspdf-autotable. Dark themed pages: cover, about, method, investment briefing, investment value, não inclui, contato.
