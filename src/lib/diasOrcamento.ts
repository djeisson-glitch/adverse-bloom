const calendario = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
export function diasOrcamento(inicio?: string | null, fim = new Date().toISOString()): number | null {
  if (!inicio || !Number.isFinite(Date.parse(inicio)) || !Number.isFinite(Date.parse(fim))) return null;
  const dia = (valor: string) => {
    const p = calendario.formatToParts(new Date(valor));
    const pegar = (tipo: string) => Number(p.find(x => x.type === tipo)?.value);
    return Date.UTC(pegar("year"), pegar("month") - 1, pegar("day"));
  };
  return Math.max(0, Math.round((dia(fim) - dia(inicio)) / 86400000));
}
