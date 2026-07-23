// =========================================================================
// Duração digitada por humano -> minutos. Um parser só, usado em todo lugar
// que lança hora (página Horas e timesheet do entregável).
//
// Formatos EXPLÍCITOS valem igual em todo lugar:
//   "2h10" / "2h10min" -> 130   "2h" -> 120   "2:10" -> 130
//   "1h30" -> 90   "1,5h" / "1.5h" -> 90   "90min" / "90m" -> 90
//
// NÚMERO PURO é ambíguo e cada tela tem seu hábito, então é parâmetro:
//   - página Horas: o campo sempre foi minutos ("60" = 60min).
//   - timesheet do entregável: o campo sempre foi horas ("1.5" = 1h30).
// Por isso `numeroPuro`. Quem quer o outro sentido usa "h" ou ":".
// =========================================================================

export function parseDuracaoMin(raw: string, numeroPuro: "min" | "h" = "min"): number | null {
  const s = (raw || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let m: RegExpMatchArray | null;

  // hh:mm
  if ((m = s.match(/^(\d+):([0-5]?\d)$/))) return +m[1] * 60 + +m[2];
  // horas decimais explícitas: 1,5h / 1.5h
  if ((m = s.match(/^(\d+(?:[.,]\d+)?)h$/))) return Math.round(parseFloat(m[1].replace(",", ".")) * 60);
  // 2h10 / 2h10min / 1h30m / 2h
  if ((m = s.match(/^(\d+)h([0-5]?\d)?(?:m(?:in)?)?$/))) return +m[1] * 60 + (m[2] ? +m[2] : 0);
  // 90min / 90m
  if ((m = s.match(/^(\d+)m(?:in)?$/))) return +m[1];
  // número puro (inteiro ou decimal) — sentido depende da tela
  if ((m = s.match(/^(\d+(?:[.,]\d+)?)$/))) {
    const n = parseFloat(m[1].replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return Math.round(numeroPuro === "h" ? n * 60 : n);
  }

  return null;
}

/** Minutos -> "2h10" / "45min" (pro feedback ao vivo e a lista). */
export function fmtDuracao(min: number): string {
  const h = Math.floor(min / 60);
  const mm = min % 60;
  if (h && mm) return `${h}h${String(mm).padStart(2, "0")}`;
  if (h) return `${h}h`;
  return `${mm}min`;
}

/** Etapas de trabalho — a "descrição" do apontamento virou escolha fixa, pra
 *  padronizar e depois dar pra somar hora por etapa. */
export const ETAPAS_TRABALHO = ["Montagem", "Edição", "Color grading", "Finalização", "Motion / VFX"];
