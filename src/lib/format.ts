// "Modo apresentação": esconde os valores em R$ na tela, pra mostrar o sistema
// pro time sem expor números. Flag de módulo que formatCurrency consulta — quem
// liga/desliga é o PrivacidadeProvider (que força o re-render pra reavaliar).
let _ocultarValores = false;
export function setOcultarValores(v: boolean) { _ocultarValores = v; }
export function getOcultarValores() { return _ocultarValores; }

export function formatCurrency(value: number): string {
  if (_ocultarValores) return "R$ •••••";
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

/** Data (YYYY-MM-DD) sem desvio de fuso: parsear as partes evita o "-1 dia"
 *  que acontece quando o JS lê a string como UTC e converte pro horário local. */
export function parseDateLocal(date: string): Date {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(date);
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  return parseDateLocal(date).toLocaleDateString("pt-BR");
}

/** Ex.: "24 de jul." — mesma proteção de fuso. */
export function formatDateShort(date: string | null): string {
  if (!date) return "—";
  return parseDateLocal(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
