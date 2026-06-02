import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface PeriodRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export type Preset = "mes_atual" | "mes_anterior" | "trimestre_atual" | "ano_atual" | "personalizado";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function monthRange(y: number, m: number): PeriodRange {
  const mm = String(m + 1).padStart(2, "0");
  const lastDay = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${lastDay}` };
}

function getPresetRange(preset: Preset): PeriodRange | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  switch (preset) {
    case "mes_atual":
      return monthRange(y, m);
    case "mes_anterior":
      return m === 0 ? monthRange(y - 1, 11) : monthRange(y, m - 1);
    case "trimestre_atual": {
      const qStart = Math.floor(m / 3) * 3;
      const qEnd = qStart + 2;
      const lastDay = new Date(y, qEnd + 1, 0).getDate();
      return { from: `${y}-${String(qStart + 1).padStart(2, "0")}-01`, to: `${y}-${String(qEnd + 1).padStart(2, "0")}-${lastDay}` };
    }
    case "ano_atual":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return null;
  }
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  value: PeriodRange;
  onChange: (range: PeriodRange) => void;
  defaultPreset?: Preset;
}

export function PeriodFilter({ onChange }: Props) {
  const now = new Date();
  const [cur, setCur] = useState({ m: now.getMonth(), y: now.getFullYear() });
  const [preset, setPreset] = useState<string>("");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  // Navegação por setas (‹ Mês Ano ›) — sempre define um mês como período.
  const goMonth = (delta: number) => {
    let m = cur.m + delta;
    let y = cur.y;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setCur({ m, y });
    setPreset("");
    onChange(monthRange(y, m));
  };

  const handlePreset = (v: string) => {
    setPreset(v);
    if (v === "mes_atual") {
      setCur({ m: now.getMonth(), y: now.getFullYear() });
    } else if (v === "mes_anterior") {
      const pm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const py = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      setCur({ m: pm, y: py });
    }
    const range = getPresetRange(v as Preset);
    if (range) onChange(range);
  };

  const handleCustomFrom = (d: Date | undefined) => {
    setCustomFrom(d);
    if (d && customTo) onChange({ from: toDateStr(d), to: toDateStr(customTo) });
  };

  const handleCustomTo = (d: Date | undefined) => {
    setCustomTo(d);
    if (customFrom && d) onChange({ from: toDateStr(customFrom), to: toDateStr(d) });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Navegador de mês */}
      <div className="flex items-center gap-1 rounded-md border border-border h-9 px-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => goMonth(-1)} aria-label="Mês anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium w-[110px] text-center select-none">{MESES[cur.m]} {cur.y}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => goMonth(1)} aria-label="Próximo mês">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Outros períodos */}
      <Select value={preset} onValueChange={handlePreset}>
        <SelectTrigger className="w-[160px] h-9 text-sm">
          <SelectValue placeholder="Outros períodos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mes_atual">Mês atual</SelectItem>
          <SelectItem value="mes_anterior">Mês anterior</SelectItem>
          <SelectItem value="trimestre_atual">Trimestre atual</SelectItem>
          <SelectItem value="ano_atual">Ano atual</SelectItem>
          <SelectItem value="personalizado">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      {preset === "personalizado" && (
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal", !customFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                {customFrom ? format(customFrom, "dd/MM/yyyy") : "De"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customFrom} onSelect={handleCustomFrom} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <span className="text-sm text-muted-foreground">até</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal", !customTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                {customTo ? format(customTo, "dd/MM/yyyy") : "Até"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customTo} onSelect={handleCustomTo} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
