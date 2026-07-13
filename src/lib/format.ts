export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Arredonda sempre pra cima, de 50 em 50 (ex.: 6070 → 6100, 6100 → 6100). */
export function roundUpTo50(value: number): number {
  if (!value || value <= 0) return 0;
  return Math.ceil(value / 50) * 50;
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  // For date-only strings (YYYY-MM-DD), parse parts to avoid UTC timezone shift
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("pt-BR");
  }
  return new Date(date).toLocaleDateString("pt-BR");
}
