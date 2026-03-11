import { createContext, useContext, useState, type ReactNode } from "react";
import type { PeriodRange } from "@/components/PeriodFilter";

function currentMonthRange(): PeriodRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    from: `${y}-${String(m + 1).padStart(2, "0")}-01`,
    to: `${y}-${String(m + 1).padStart(2, "0")}-${lastDay}`,
  };
}

interface PeriodContextType {
  period: PeriodRange;
  setPeriod: (range: PeriodRange) => void;
}

const PeriodContext = createContext<PeriodContextType | null>(null);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<PeriodRange>(currentMonthRange);
  return (
    <PeriodContext.Provider value={{ period, setPeriod }}>
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriod(): PeriodContextType {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("usePeriod must be used within PeriodProvider");
  return ctx;
}
