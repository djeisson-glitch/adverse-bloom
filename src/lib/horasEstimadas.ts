export const FATOR_DAVINCI = 1.25;

type Apontamento = { duration_min: number; source?: string; time_multiplier?: number };

/** Mantém minutos registrados intactos; arredonda apenas a soma exibida. */
export function minutosEstimados(entries: Apontamento[]): number {
  return Math.round(entries.reduce((total, entry) => total + entry.duration_min *
    (entry.source === "davinci" ? (entry.time_multiplier ?? FATOR_DAVINCI) : 1), 0));
}
