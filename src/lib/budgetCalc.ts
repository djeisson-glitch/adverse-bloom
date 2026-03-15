import type { BudgetItem } from "@/hooks/useBudgets";

export interface BudgetTotals {
  subtotal1: number;
  markupValue: number;
  subtotal2: number;
  taxValue: number;
  bvValue: number;
  commissionValue: number;
  totalValue: number;
  marginValue: number;
  marginPercent: number;
  supplierTotal: number;
  categoryBreakdown: Record<string, number>;
}

export function calcBudgetTotals(
  items: BudgetItem[],
  markupPercent: number,
  taxPercent: number,
  bvPercent: number,
  commissionPercent: number,
  discount: number,
  addition: number
): BudgetTotals {
  const subtotal1 = items.reduce((s, i) => s + i.client_price, 0);
  const markupValue = subtotal1 * (markupPercent / 100);

  // Jobb formula: commission is on (subtotal1 + markup)
  const commissionValue = (subtotal1 + markupValue) * (commissionPercent / 100);
  const subtotal2 = subtotal1 + markupValue + commissionValue;

  // Recursive: Total = ST2 / (1 - bv% - tax%)
  // BV = bv% × Total, Imposto = tax% × Total
  const bv = bvPercent / 100;
  const tax = taxPercent / 100;
  const denominator = 1 - bv - tax;

  let totalBeforeAdj: number;
  let bvValue: number;
  let taxValue: number;

  if (denominator > 0) {
    totalBeforeAdj = subtotal2 / denominator;
    bvValue = bv * totalBeforeAdj;
    taxValue = tax * totalBeforeAdj;
  } else {
    totalBeforeAdj = subtotal2;
    bvValue = 0;
    taxValue = 0;
  }

  const totalValue = Math.ceil(totalBeforeAdj + addition - discount);

  const supplierTotal = items.reduce((s, i) => s + i.supplier_cost, 0);
  // Margem Real = Total - Fornecedores - BV - Comissão (impostos não alocados)
  const marginValue = totalValue - supplierTotal - bvValue - commissionValue;
  const marginPercent = totalValue > 0 ? (marginValue / totalValue) * 100 : 0;

  const categoryBreakdown: Record<string, number> = {};
  items.forEach((i) => {
    categoryBreakdown[i.category] = (categoryBreakdown[i.category] || 0) + i.client_price;
  });

  return {
    subtotal1,
    markupValue,
    subtotal2,
    taxValue,
    bvValue,
    commissionValue,
    totalValue,
    marginValue,
    marginPercent,
    supplierTotal,
    categoryBreakdown,
  };
}
