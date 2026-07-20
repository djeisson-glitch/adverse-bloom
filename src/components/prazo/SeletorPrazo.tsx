import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Horários comerciais da produtora, de 30 em 30 min, sem o intervalo do almoço:
 * 09:30–12:00 e 13:30–18:00. É a lista que aparece no seletor de prazo — tanto
 * interno quanto no formulário do cliente. Uma pessoa não escolhe "prazo às 3h".
 */
export const HORARIOS_COMERCIAIS: string[] = (() => {
  const out: string[] = [];
  const add = (ini: string, fim: string) => {
    let [h, m] = ini.split(":").map(Number);
    const [hf, mf] = fim.split(":").map(Number);
    while (h < hf || (h === hf && m <= mf)) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      m += 30;
      if (m >= 60) { m -= 60; h += 1; }
    }
  };
  add("09:30", "12:00");
  add("13:30", "18:00");
  return out;
})();

const SEM_HORA = "__sem_hora__";

/** "25/07 · 14:30" ou "25/07" — pra mostrar o prazo com a hora quando tiver. */
export function formatPrazoHora(data: string | null, hora: string | null): string {
  if (!data) return "—";
  const m = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dia = m ? `${m[3]}/${m[2]}` : data;
  const h = (hora || "").slice(0, 5);
  return h ? `${dia} · ${h}` : dia;
}

/**
 * Campo de prazo com data + horário comercial opcional.
 * `data` = "YYYY-MM-DD" | ""; `hora` = "HH:MM" | "".
 */
export function SeletorPrazo({
  data,
  hora,
  onChange,
  className = "",
}: {
  data: string;
  hora: string;
  onChange: (v: { data: string; hora: string }) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-2 ${className}`}>
      <Input
        type="date"
        value={data}
        onChange={(e) => onChange({ data: e.target.value, hora })}
        className="h-8 flex-1"
      />
      <Select
        // Sem data escolhida, hora sozinha não faz sentido — desabilita.
        value={hora ? hora.slice(0, 5) : SEM_HORA}
        onValueChange={(v) => onChange({ data, hora: v === SEM_HORA ? "" : v })}
        disabled={!data}
      >
        <SelectTrigger className="h-8 w-[104px] shrink-0 text-xs">
          <SelectValue placeholder="Horário" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_HORA} className="text-xs">Sem horário</SelectItem>
          {HORARIOS_COMERCIAIS.map((h) => (
            <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
