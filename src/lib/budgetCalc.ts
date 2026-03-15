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
  const subtotal2 = subtotal1 + markupValue;
  const taxValue = subtotal2 * (taxPercent / 100);
  const bvValue = subtotal2 * (bvPercent / 100);
  const commissionValue = subtotal2 * (commissionPercent / 100);
  const totalValue = Math.ceil(subtotal2 + taxValue + bvValue + commissionValue + addition - discount);
  const marginValue = items.reduce((s, i) => s + (i.client_price - i.supplier_cost), 0);
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
    categoryBreakdown,
  };
}
