import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Check, CloudOff, Loader2 } from "lucide-react";

export type StatusSalvamento = "ocioso" | "salvando" | "salvo" | "erro";

type Ctx = {
  reportar: (id: string, status: StatusSalvamento) => void;
  geral: StatusSalvamento;
};

const AutosaveCtx = createContext<Ctx | null>(null);

/** Usado pelos campos pra avisar a tela que estão salvando. Opcional:
 *  o campo funciona igual fora de um provider (só não soma no indicador). */
export function useReportarSalvamento() {
  return useContext(AutosaveCtx)?.reportar;
}

/** Envolve uma tela pra ela ter UM indicador de "salvando/salvo" no topo,
 *  em vez de um por campo. */
export function AutosaveProvider({ children }: { children: ReactNode }) {
  const [mapa, setMapa] = useState<Record<string, StatusSalvamento>>({});

  const reportar = useCallback((id: string, status: StatusSalvamento) => {
    setMapa((m) => (m[id] === status ? m : { ...m, [id]: status }));
  }, []);

  // Erro ganha de tudo (a pessoa precisa saber que não gravou), depois "salvando".
  const geral = useMemo<StatusSalvamento>(() => {
    const vals = Object.values(mapa);
    if (vals.includes("erro")) return "erro";
    if (vals.includes("salvando")) return "salvando";
    if (vals.includes("salvo")) return "salvo";
    return "ocioso";
  }, [mapa]);

  const value = useMemo(() => ({ reportar, geral }), [reportar, geral]);
  return <AutosaveCtx.Provider value={value}>{children}</AutosaveCtx.Provider>;
}

/** Indicador de estado. Sem provider (ou com status próprio) também funciona. */
export function IndicadorAutosave({
  status,
  className = "",
}: {
  status?: StatusSalvamento;
  className?: string;
}) {
  const ctx = useContext(AutosaveCtx);
  const s = status ?? ctx?.geral ?? "ocioso";
  if (s === "ocioso") return null;

  const base = `inline-flex items-center gap-1.5 text-xs ${className}`;
  if (s === "salvando")
    return (
      <span className={`${base} text-muted-foreground`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Salvando…
      </span>
    );
  if (s === "salvo")
    return (
      <span className={`${base} text-success`}>
        <Check className="h-3 w-3" />
        Salvo
      </span>
    );
  return (
    <span className={`${base} text-destructive`} title="Sua edição continua na tela — tente de novo">
      <CloudOff className="h-3 w-3" />
      Não salvou
    </span>
  );
}
